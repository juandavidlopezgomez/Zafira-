<?php
namespace BF\Controllers;

use BF\{Database, Auth, Response};

class RoomsController {
    public static function create(): void {
        $payload = Auth::requireUser();
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];
        $mode    = trim($body['mode'] ?? '');
        $isPrem  = (bool)($body['isPremium'] ?? false);

        if (!$mode) Response::error('El campo mode es requerido');

        $MODES = ['bottle','truth-dare','battle-1v1','liga','juicio','oscuro',
                  'cartas','termometro','actores','ultimo-pie','todo-nada'];
        if (!in_array($mode, $MODES, true)) Response::error('Modo inválido');

        $db   = Database::get();
        $id   = self::uuid();
        $code = self::generateCode();

        $db->prepare(
            'INSERT INTO rooms (id, code, host_id, mode, is_premium) VALUES (?, ?, ?, ?, ?)'
        )->execute([$id, $code, $payload['sub'], $mode, $isPrem ? 1 : 0]);

        // El host entra automáticamente
        $stmt = $db->prepare('SELECT username FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$payload['sub']]);
        $username = $stmt->fetchColumn();

        $db->prepare(
            'INSERT INTO room_players (room_id, user_id, username, last_seen) VALUES (?, ?, ?, NOW())'
        )->execute([$id, $payload['sub'], $username]);

        $qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='
               . urlencode("https://battleflirt.app/sala/{$code}");

        Response::ok([
            'room' => [
                'id'         => $id,
                'code'       => $code,
                'hostId'     => $payload['sub'],
                'mode'       => $mode,
                'status'     => 'waiting',
                'maxPlayers' => 12,
                'isPremium'  => $isPrem,
            ],
            'qrUrl' => $qrUrl,
        ]);
    }

    public static function findByCode(string $code): void {
        Auth::requireUser();
        $db   = Database::get();
        $stmt = $db->prepare('SELECT * FROM rooms WHERE code = ? LIMIT 1');
        $stmt->execute([strtoupper($code)]);
        $room = $stmt->fetch();
        if (!$room) Response::error('Sala no encontrada', 404);

        $players = self::getPlayers($db, $room['id']);

        Response::ok([
            'id'         => $room['id'],
            'code'       => $room['code'],
            'hostId'     => $room['host_id'],
            'mode'       => $room['mode'],
            'status'     => $room['status'],
            'maxPlayers' => (int)$room['max_players'],
            'isPremium'  => (bool)$room['is_premium'],
            'players'    => $players,
        ]);
    }

    public static function join(string $code): void {
        $payload  = Auth::requireUser();
        $userId   = $payload['sub'];
        $db       = Database::get();

        $stmt = $db->prepare('SELECT * FROM rooms WHERE code = ? LIMIT 1');
        $stmt->execute([strtoupper($code)]);
        $room = $stmt->fetch();
        if (!$room) Response::error('Sala no encontrada', 404);
        if ($room['status'] !== 'waiting') Response::error('La sala ya no acepta jugadores');

        $players = self::getPlayers($db, $room['id']);
        $isAlreadyIn = false;
        foreach ($players as $p) {
            if ($p['id'] === $userId) { $isAlreadyIn = true; break; }
        }

        if (!$isAlreadyIn) {
            if (count($players) >= (int)$room['max_players']) {
                Response::error('La sala está llena');
            }

            $stmt = $db->prepare('SELECT username FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([$userId]);
            $username = $stmt->fetchColumn();

            $db->prepare(
                'INSERT INTO room_players (room_id, user_id, username, last_seen) VALUES (?, ?, ?, NOW())'
            )->execute([$room['id'], $userId, $username]);

            // Evento: player joined
            self::pushEvent($db, $room['id'], 'room:player_joined', [
                'userId'   => $userId,
                'username' => $username,
            ]);

            $players = self::getPlayers($db, $room['id']);
        }

        Response::ok([
            'roomId'  => $room['id'],
            'players' => $players,
            'mode'    => $room['mode'],
            'status'  => $room['status'],
        ]);
    }

    public static function leave(string $roomId): void {
        $payload = Auth::requireUser();
        $userId  = $payload['sub'];
        $db      = Database::get();

        $db->prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?')
           ->execute([$roomId, $userId]);

        self::pushEvent($db, $roomId, 'room:player_left', ['userId' => $userId]);
        self::cleanupInactivePlayers($db, $roomId);

        Response::ok(null);
    }

    public static function players(string $roomId): void {
        Auth::requireUser();
        $db      = Database::get();
        $players = self::getPlayers($db, $roomId);
        Response::ok($players);
    }

    public static function state(string $roomId): void {
        $payload = Auth::requireUser();
        $db      = Database::get();

        // Heartbeat
        $db->prepare('UPDATE room_players SET last_seen = NOW() WHERE room_id = ? AND user_id = ?')
           ->execute([$roomId, $payload['sub']]);

        self::cleanupInactivePlayers($db, $roomId);

        $stmt = $db->prepare('SELECT * FROM rooms WHERE id = ? LIMIT 1');
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();
        if (!$room) Response::error('Sala no encontrada', 404);

        $players = self::getPlayers($db, $roomId);

        Response::ok([
            'roomId'  => $roomId,
            'status'  => $room['status'],
            'mode'    => $room['mode'],
            'players' => $players,
        ]);
    }

    public static function getPlayers(\PDO $db, string $roomId): array {
        $stmt = $db->prepare(
            'SELECT rp.user_id as id, rp.username,
                    u.avatar_url as avatarUrl,
                    u.is_premium as isPremium,
                    COALESCE((SELECT SUM(amount) FROM llamas_transactions WHERE user_id = rp.user_id), 0) as llamasBalance
             FROM room_players rp
             JOIN users u ON u.id = rp.user_id
             WHERE rp.room_id = ?
             ORDER BY rp.joined_at ASC'
        );
        $stmt->execute([$roomId]);
        return array_map(fn($p) => [
            'id'            => $p['id'],
            'username'      => $p['username'],
            'avatarUrl'     => $p['avatarUrl'],
            'isPremium'     => (bool)$p['isPremium'],
            'llamasBalance' => (int)$p['llamasBalance'],
        ], $stmt->fetchAll());
    }

    public static function pushEvent(\PDO $db, string $roomId, string $type, array $payload, ?string $targetUserId = null): void {
        $db->prepare(
            'INSERT INTO game_events (room_id, event_type, payload, target_user_id) VALUES (?, ?, ?, ?)'
        )->execute([$roomId, $type, json_encode($payload), $targetUserId]);
    }

    private static function cleanupInactivePlayers(\PDO $db, string $roomId): void {
        $db->prepare(
            'DELETE FROM room_players WHERE room_id = ? AND last_seen < DATE_SUB(NOW(), INTERVAL ? SECOND)'
        )->execute([$roomId, PLAYER_TIMEOUT_SECONDS]);
    }

    private static function generateCode(): string {
        $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        return implode('', array_map(fn() => $chars[random_int(0, strlen($chars) - 1)], range(1, 6)));
    }

    private static function uuid(): string {
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }
}
