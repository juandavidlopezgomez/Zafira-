<?php
namespace BF;

use PDO;

/**
 * El Hilo: chat con tensión progresiva (5 niveles, 4 tipos).
 * - Tensión vive en game_state como `hilo:{roomId}:tension` (regla #6)
 * - Snapshot a hilo_tension_history cada 5 minutos
 * - Moderación con Ai::moderate() antes de broadcast (regla #11)
 * - Modo Anónimo emite aliasId, NUNCA userId (regla #8)
 */
class Hilo {
    // ─── 4 tipos de Hilo ────────────────────────────────────────────────────
    public const TYPE_DIRECTO   = 'directo';   // visible a todos
    public const TYPE_SECRETO   = 'secreto';   // 2 jugadores privados (Premium)
    public const TYPE_ANONIMO   = 'anonimo';   // alias generado
    public const TYPE_ARDIENTE  = 'ardiente';  // autodestructivo 60s (Premium nivel 4+)

    // ─── 5 niveles de tensión ───────────────────────────────────────────────
    public const LEVELS = [
        1 => ['name' => 'Frío',      'color' => '#3B82F6', 'min' => 0,   'max' => 19,  'pulse' => false],
        2 => ['name' => 'Tibio',     'color' => '#22C55E', 'min' => 20,  'max' => 39,  'pulse' => false],
        3 => ['name' => 'Caliente',  'color' => '#FF6B00', 'min' => 40,  'max' => 59,  'pulse' => false],
        4 => ['name' => 'Ardiente',  'color' => '#FF2D55', 'min' => 60,  'max' => 79,  'pulse' => false],
        5 => ['name' => 'Peligroso', 'color' => '#7F1D1D', 'min' => 80,  'max' => 100, 'pulse' => true],
    ];

    // ─── Puntos de tensión por acción ───────────────────────────────────────
    public const T_MESSAGE     = 1;
    public const T_REACTION    = 2;
    public const T_CONFESSION  = 5;
    public const T_GIF         = 1;
    public const T_SKIP        = -1;
    public const T_MAX         = 100;

    // ─── Tensión actual de la sala ──────────────────────────────────────────
    public static function getTension(PDO $db, string $roomId): int {
        $stmt = $db->prepare(
            "SELECT state_value FROM game_state WHERE room_id = ? AND state_key = 'hilo_tension' LIMIT 1"
        );
        $stmt->execute([$roomId]);
        return (int)($stmt->fetchColumn() ?: 0);
    }

    // ─── Sumar/restar tensión, devuelve [tension, level, leveledUp] ─────────
    public static function addTension(PDO $db, string $roomId, int $delta): array {
        $current = self::getTension($db, $roomId);
        $oldLevel = self::levelFromTension($current);
        $newTension = max(0, min(self::T_MAX, $current + $delta));

        $db->prepare(
            "INSERT INTO game_state (room_id, state_key, state_value, expires_at)
             VALUES (?, 'hilo_tension', ?, DATE_ADD(NOW(), INTERVAL 1 DAY))
             ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), expires_at = VALUES(expires_at)"
        )->execute([$roomId, (string)$newTension]);

        $newLevel = self::levelFromTension($newTension);
        return [
            'tension'    => $newTension,
            'level'      => $newLevel,
            'levelInfo'  => self::levelInfo($newLevel),
            'leveledUp'  => $newLevel > $oldLevel,
            'maxReached' => $newTension >= self::T_MAX && $current < self::T_MAX,
        ];
    }

    // ─── Nivel calculado desde tensión ──────────────────────────────────────
    public static function levelFromTension(int $tension): int {
        foreach (self::LEVELS as $level => $cfg) {
            if ($tension >= $cfg['min'] && $tension <= $cfg['max']) {
                return $level;
            }
        }
        return 1;
    }

    public static function levelInfo(int $level): array {
        $cfg = self::LEVELS[$level] ?? self::LEVELS[1];
        return ['level' => $level, ...$cfg];
    }

    // ─── Validar acceso a tipo de Hilo ──────────────────────────────────────
    public static function canUseType(PDO $db, string $userId, string $type, int $currentTensionLevel): bool {
        if ($type === self::TYPE_DIRECTO || $type === self::TYPE_ANONIMO) return true;

        $stmt = $db->prepare('SELECT is_premium FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $isPremium = (bool)$stmt->fetchColumn();

        if ($type === self::TYPE_SECRETO)  return $isPremium;
        if ($type === self::TYPE_ARDIENTE) return $isPremium && $currentTensionLevel >= 4;

        return false;
    }

    // ─── Validar acceso a nivel 5 (Premium) ─────────────────────────────────
    public static function canAccessLevel5(PDO $db, string $userId): bool {
        $stmt = $db->prepare('SELECT is_premium FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        return (bool)$stmt->fetchColumn();
    }

    // ─── Alias estable por (room, user) — preserva privacidad ───────────────
    public static function aliasFor(string $roomId, string $userId): string {
        return 'Anon-' . strtoupper(substr(md5($userId . $roomId), 0, 5));
    }

    // ─── Snapshot de tensión a history (llamar via cron o on-demand) ────────
    public static function snapshot(PDO $db, string $roomId): void {
        $tension = self::getTension($db, $roomId);
        $level   = self::levelFromTension($tension);
        $id      = self::uuid();
        $db->prepare(
            'INSERT INTO hilo_tension_history (id, room_id, tension, level) VALUES (?, ?, ?, ?)'
        )->execute([$id, $roomId, $tension, $level]);
    }

    // ─── Insertar mensaje (con moderación opcional) ─────────────────────────
    public static function insertMessage(
        PDO $db,
        string $roomId,
        ?string $userId,
        string $content,
        bool $anonymous = false,
        ?int $autoDestroyInSec = null
    ): array {
        $id        = self::uuid();
        $tension   = self::getTension($db, $roomId);
        $level     = self::levelFromTension($tension);
        $aliasId   = $anonymous && $userId ? self::aliasFor($roomId, $userId) : null;

        // Si anonimo, NO guardamos username real
        $username = null;
        if (!$anonymous && $userId) {
            $u = $db->prepare('SELECT username FROM users WHERE id = ? LIMIT 1');
            $u->execute([$userId]);
            $username = $u->fetchColumn() ?: null;
        }

        $expiresAt = $autoDestroyInSec
            ? date('Y-m-d H:i:s', time() + $autoDestroyInSec)
            : null;

        $db->prepare(
            'INSERT INTO hilo_messages
             (id, room_id, user_id, alias_id, username, content, tension, tension_at_send, level_at_send, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $id,
            $roomId,
            $anonymous ? null : $userId, // En anónimo NO guardamos user_id (regla #8)
            $aliasId,
            $username,
            $content,
            self::T_MESSAGE,
            $tension,
            $level,
            $expiresAt,
        ]);

        $stmt = $db->prepare('SELECT seq FROM hilo_messages WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $seq = (int)$stmt->fetchColumn();

        return [
            'id'        => $id,
            'seq'       => $seq,
            'username'  => $aliasId ?? $username,
            'content'   => $content,
            'tension'   => $tension,
            'level'     => $level,
            'expiresAt' => $expiresAt,
            'anonymous' => $anonymous,
        ];
    }

    // ─── Insertar confesión (nivel 4+, permanente) ──────────────────────────
    public static function insertConfession(PDO $db, string $roomId, string $userId, string $text): string {
        $id = self::uuid();
        $db->prepare(
            'INSERT INTO hilo_confessions (id, room_id, confessor_id, text) VALUES (?, ?, ?, ?)'
        )->execute([$id, $roomId, $userId, $text]);
        return $id;
    }

    private static function uuid(): string {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff),
            mt_rand(0,0x0fff)|0x4000, mt_rand(0,0x3fff)|0x8000,
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff));
    }
}
