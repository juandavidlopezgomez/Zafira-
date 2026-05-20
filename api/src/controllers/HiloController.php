<?php
namespace BF\Controllers;

use BF\{Database, Auth, Response, Hilo, Ai, Llamas, Charisma};

class HiloController {
    // GET /api/hilo/:roomId/messages?since=:seq
    // Filtra mensajes ardientes ya expirados
    public static function messages(string $roomId): void {
        Auth::requireUser();
        $since = (int)($_GET['since'] ?? 0);
        $db    = Database::get();

        $stmt = $db->prepare(
            'SELECT id, seq, alias_id, username, content, tension, tension_at_send, level_at_send,
                    expires_at, created_at
             FROM hilo_messages
             WHERE room_id = ? AND seq > ?
               AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY seq ASC LIMIT 100'
        );
        $stmt->execute([$roomId, $since]);
        $rows = $stmt->fetchAll();

        // Cargar reacciones agrupadas por mensaje
        $reactions = self::loadReactions($db, array_column($rows, 'id'));

        $messages = array_map(static function ($r) use ($reactions) {
            return [
                'id'           => $r['id'],
                'seq'          => (int)$r['seq'],
                'username'     => $r['alias_id'] ?? $r['username'] ?? 'Anon',
                'content'      => $r['content'],
                'tensionAtSend'=> (int)$r['tension_at_send'],
                'levelAtSend'  => (int)$r['level_at_send'],
                'expiresAt'    => $r['expires_at'],
                'createdAt'    => $r['created_at'],
                'reactions'    => $reactions[$r['id']] ?? [],
            ];
        }, $rows);

        Response::ok([
            'messages' => $messages,
            'tension'  => Hilo::getTension($db, $roomId),
            'level'    => Hilo::levelInfo(Hilo::levelFromTension(Hilo::getTension($db, $roomId))),
        ]);
    }

    // POST /api/hilo/:roomId/messages
    // Body: { content, type?: 'directo'|'secreto'|'anonimo'|'ardiente', anonymous?, targetUserId? }
    public static function send(string $roomId): void {
        $payload = Auth::requireUser();
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];
        $content = trim($body['content'] ?? '');
        $type    = $body['type']      ?? Hilo::TYPE_DIRECTO;
        $anonymous = (bool)($body['anonymous'] ?? false) || $type === Hilo::TYPE_ANONIMO;

        if (!$content)                       Response::error('El mensaje no puede estar vacío');
        if (mb_strlen($content) > 500)       Response::error('Mensaje demasiado largo (max 500)');

        $db = Database::get();
        $tension     = Hilo::getTension($db, $roomId);
        $tensionLvl  = Hilo::levelFromTension($tension);

        // Validar tipo (Premium gating)
        if (!Hilo::canUseType($db, $payload['sub'], $type, $tensionLvl)) {
            Response::error("Tipo de Hilo '{$type}' no disponible. Requiere Premium o nivel mayor", 403);
        }

        // Moderación (regla #11)
        $mod = Ai::moderate($content);
        if ($mod && !empty($mod['flagged'])) {
            self::logModeration($db, $payload['sub'], $roomId, $content, $mod, 'rejected');
            Response::error('Mensaje no permitido por moderación', 422);
        }

        // Hilo Ardiente: autodestructivo en 60s
        $ttl = $type === Hilo::TYPE_ARDIENTE ? 60 : null;

        // Insertar mensaje
        $msg = Hilo::insertMessage($db, $roomId, $payload['sub'], $content, $anonymous, $ttl);

        // Sumar tensión + chequear nivel
        $update = Hilo::addTension($db, $roomId, Hilo::T_MESSAGE);

        // Bonus si llegó a tensión máxima (todos los presentes ganan LLAMAS)
        if ($update['maxReached']) {
            self::onMaxTension($db, $roomId);
        }

        Response::ok([
            'message' => $msg,
            'tension' => $update['tension'],
            'level'   => $update['levelInfo'],
            'leveledUp' => $update['leveledUp'],
        ]);
    }

    // POST /api/hilo/:roomId/react
    // Body: { messageId, reaction }
    public static function react(string $roomId): void {
        $payload    = Auth::requireUser();
        $body       = json_decode(file_get_contents('php://input'), true) ?? [];
        $messageId  = $body['messageId'] ?? '';
        $reaction   = trim($body['reaction'] ?? '');

        if (!$messageId || !$reaction) Response::error('messageId y reaction requeridos');
        if (mb_strlen($reaction) > 8)  Response::error('reaction demasiado largo');

        $db = Database::get();

        // Verificar que el mensaje existe en la sala
        $check = $db->prepare('SELECT 1 FROM hilo_messages WHERE id = ? AND room_id = ? LIMIT 1');
        $check->execute([$messageId, $roomId]);
        if (!$check->fetch()) Response::error('Mensaje no encontrado', 404);

        $db->prepare(
            'INSERT INTO hilo_reactions (message_id, user_id, reaction)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE reaction = VALUES(reaction)'
        )->execute([$messageId, $payload['sub'], $reaction]);

        // +5 LLAMAS al usuario que reacciona
        Llamas::awardHiloReaction($db, $payload['sub'], $messageId);

        // +2 a la tensión global del Hilo
        $update = Hilo::addTension($db, $roomId, Hilo::T_REACTION);
        if ($update['maxReached']) self::onMaxTension($db, $roomId);

        Response::ok([
            'tension' => $update['tension'],
            'level'   => $update['levelInfo'],
        ]);
    }

    // POST /api/hilo/:roomId/confession  (requiere nivel 4+)
    // Body: { text, anonymous? }
    public static function confession(string $roomId): void {
        $payload = Auth::requireUser();
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];
        $text    = trim($body['text'] ?? '');
        $anonymous = (bool)($body['anonymous'] ?? true);

        if (!$text || mb_strlen($text) > 800) Response::error('Texto inválido (1-800 chars)');

        $db = Database::get();
        $tension = Hilo::getTension($db, $roomId);
        $level   = Hilo::levelFromTension($tension);
        if ($level < 4) Response::error('Las confesiones requieren nivel 4 (Ardiente)', 403);

        // Moderación
        $mod = Ai::moderate($text);
        if ($mod && !empty($mod['flagged'])) {
            self::logModeration($db, $payload['sub'], $roomId, $text, $mod, 'rejected');
            Response::error('Confesión no permitida por moderación', 422);
        }

        // Persistir confesión permanente
        $confessionId = Hilo::insertConfession($db, $roomId, $payload['sub'], $text);

        // También como mensaje (para que aparezca en el chat)
        $msg = Hilo::insertMessage($db, $roomId, $payload['sub'], "💋 " . $text, $anonymous, null);

        // +5 a tensión
        $update = Hilo::addTension($db, $roomId, Hilo::T_CONFESSION);
        if ($update['maxReached']) self::onMaxTension($db, $roomId);

        // +carisma por confesarse
        Charisma::award($db, $payload['sub'], 10, 'hilo_confession');

        Response::ok([
            'confessionId' => $confessionId,
            'message'      => $msg,
            'tension'      => $update['tension'],
            'level'        => $update['levelInfo'],
        ]);
    }

    // GET /api/hilo/:roomId/tension
    public static function tension(string $roomId): void {
        Auth::requireUser();
        $db      = Database::get();
        $tension = Hilo::getTension($db, $roomId);
        $level   = Hilo::levelFromTension($tension);

        Response::ok([
            'tension' => $tension,
            'level'   => Hilo::levelInfo($level),
            'levels'  => Hilo::LEVELS,
        ]);
    }

    // ─── Cuando llega tensión máxima: bonus a todos ──────────────────────────
    private static function onMaxTension(\PDO $db, string $roomId): void {
        $stmt = $db->prepare('SELECT user_id FROM room_players WHERE room_id = ?');
        $stmt->execute([$roomId]);
        $userIds = $stmt->fetchAll(\PDO::FETCH_COLUMN);
        foreach ($userIds as $uid) {
            Llamas::credit($db, $uid, 50, 'hilo_max_tension', null, $roomId);
        }
        // Snapshot al alcanzar el máximo
        Hilo::snapshot($db, $roomId);
    }

    // ─── Cargar reacciones agrupadas por mensaje ─────────────────────────────
    private static function loadReactions(\PDO $db, array $messageIds): array {
        if (!$messageIds) return [];
        $place = implode(',', array_fill(0, count($messageIds), '?'));
        $stmt = $db->prepare(
            "SELECT message_id, reaction, COUNT(*) as count
             FROM hilo_reactions
             WHERE message_id IN ({$place})
             GROUP BY message_id, reaction"
        );
        $stmt->execute($messageIds);
        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[$r['message_id']][] = ['reaction' => $r['reaction'], 'count' => (int)$r['count']];
        }
        return $out;
    }

    // ─── Log de moderación ───────────────────────────────────────────────────
    private static function logModeration(\PDO $db, string $userId, string $roomId, string $content, array $mod, string $action): void {
        $id = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff),
            mt_rand(0,0x0fff)|0x4000, mt_rand(0,0x3fff)|0x8000,
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff));
        $db->prepare(
            'INSERT INTO moderation_logs (id, user_id, room_id, content, categories, action) VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$id, $userId, $roomId, $content, json_encode($mod), $action]);
    }
}
