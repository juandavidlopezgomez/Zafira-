<?php
namespace BF\Controllers;

use BF\{Database, Auth, Response};

class HiloController {
    public static function messages(string $roomId): void {
        Auth::requireUser();
        $since = (int)($_GET['since'] ?? 0);
        $db    = Database::get();

        $stmt = $db->prepare(
            'SELECT id, user_id, alias_id, username, content, tension, created_at
             FROM hilo_messages
             WHERE room_id = ? AND seq > ?
             ORDER BY seq ASC LIMIT 50'
        );
        $stmt->execute([$roomId, $since]);
        $msgs = $stmt->fetchAll();

        Response::ok(['messages' => $msgs]);
    }

    public static function send(string $roomId): void {
        $payload = Auth::requireUser();
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];
        $content = trim($body['content'] ?? '');

        if (!$content) Response::error('El mensaje no puede estar vacío');
        if (mb_strlen($content) > 500) Response::error('Mensaje demasiado largo');

        $db       = Database::get();
        $id       = self::uuid();
        $aliasId  = 'Anon-' . substr(md5($payload['sub'] . $roomId), 0, 4);

        // Calcular tensión (palabras clave provocativas suben el nivel)
        $tension  = self::calcTension($content);

        // Moderación básica
        if (self::isBlocked($content)) Response::error('Mensaje bloqueado por moderación');

        $db->prepare(
            'INSERT INTO hilo_messages (id, room_id, user_id, alias_id, username, content, tension)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$id, $roomId, $payload['sub'], $aliasId, $aliasId, $content, $tension]);

        $stmt = $db->prepare('SELECT seq FROM hilo_messages WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $seq = (int)$stmt->fetchColumn();

        Response::ok([
            'id'        => $id,
            'aliasId'   => $aliasId,
            'username'  => $aliasId,
            'content'   => $content,
            'tension'   => $tension,
            'createdAt' => date('Y-m-d H:i:s'),
            'seq'       => $seq,
        ]);
    }

    public static function react(string $roomId): void {
        $payload    = Auth::requireUser();
        $body       = json_decode(file_get_contents('php://input'), true) ?? [];
        $messageId  = $body['messageId'] ?? '';
        $reaction   = $body['reaction'] ?? '';

        if (!$messageId || !$reaction) Response::error('Datos incompletos');

        $db = Database::get();
        $db->prepare(
            'INSERT INTO hilo_reactions (message_id, user_id, reaction)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE reaction = VALUES(reaction)'
        )->execute([$messageId, $payload['sub'], $reaction]);

        Response::ok(null);
    }

    private static function calcTension(string $text): int {
        $hot = ['secreto','beso','noche','contigo','mentira','atrevido','íntimo','sensual'];
        $text = mb_strtolower($text);
        $hits = 0;
        foreach ($hot as $word) {
            if (str_contains($text, $word)) $hits++;
        }
        return min(10, $hits * 2);
    }

    private static function isBlocked(string $text): bool {
        $blocked = ['insulto1','insulto2']; // ampliar según necesidad
        $text    = mb_strtolower($text);
        foreach ($blocked as $w) {
            if (str_contains($text, $w)) return true;
        }
        return false;
    }

    private static function uuid(): string {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0,0xffff),mt_rand(0,0xffff),mt_rand(0,0xffff),
            mt_rand(0,0x0fff)|0x4000,mt_rand(0,0x3fff)|0x8000,
            mt_rand(0,0xffff),mt_rand(0,0xffff),mt_rand(0,0xffff));
    }
}
