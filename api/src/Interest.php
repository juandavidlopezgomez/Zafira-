<?php
namespace BF;

use PDO;

/**
 * Sistema de señales de interés silenciosas (regla #4 reveal-only).
 * - signal(): registra interés (NUNCA emite evento broadcast)
 * - revealMatches(): al final de partida computa intersecciones mutuas
 *   y emite room:match_reveal SOLO a los involucrados
 */
class Interest {
    // ─── Registrar señal silenciosa (idempotente) ───────────────────────────
    public static function signal(PDO $db, string $roomId, string $fromUserId, string $targetUserId): void {
        if ($fromUserId === $targetUserId) return;

        $key = "interest:{$fromUserId}";
        $current = self::readInterests($db, $roomId, $fromUserId);
        if (in_array($targetUserId, $current, true)) return;

        $current[] = $targetUserId;
        self::writeInterests($db, $roomId, $fromUserId, $current);
    }

    // ─── Quitar señal (toggle off) ──────────────────────────────────────────
    public static function unsignal(PDO $db, string $roomId, string $fromUserId, string $targetUserId): void {
        $current = self::readInterests($db, $roomId, $fromUserId);
        $filtered = array_values(array_filter($current, static fn($id) => $id !== $targetUserId));
        self::writeInterests($db, $roomId, $fromUserId, $filtered);
    }

    // ─── Lista de targets propios (privado al usuario) ──────────────────────
    public static function myInterests(PDO $db, string $roomId, string $userId): array {
        return self::readInterests($db, $roomId, $userId);
    }

    // ─── Computa matches mutuos al finalizar la sala ────────────────────────
    // Devuelve lista de pares [['user_a' => id1, 'user_b' => id2], ...]
    // Inserta en interest_matches, premia +15 LLAMAS y +15 carisma a c/u,
    // y empuja eventos room:match_reveal SOLO a los involucrados (target_user_id).
    public static function revealMatches(PDO $db, string $roomId): array {
        // 1. Obtener todos los jugadores de la sala
        $stmt = $db->prepare('SELECT user_id FROM room_players WHERE room_id = ?');
        $stmt->execute([$roomId]);
        $playerIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

        // 2. Cargar interests de todos
        $byUser = [];
        foreach ($playerIds as $uid) {
            $byUser[$uid] = self::readInterests($db, $roomId, $uid);
        }

        // 3. Buscar intersecciones mutuas (sin duplicar par)
        $matches = [];
        $seen    = [];
        foreach ($byUser as $a => $targets) {
            foreach ($targets as $b) {
                if (!isset($byUser[$b])) continue;
                if (!in_array($a, $byUser[$b], true)) continue;

                $key = self::pairKey($a, $b);
                if (isset($seen[$key])) continue;
                $seen[$key] = true;
                $matches[] = ['user_a' => $a, 'user_b' => $b];
            }
        }

        // 4. Persistir en interest_matches + recompensas + eventos privados
        foreach ($matches as $m) {
            self::persistMatch($db, $roomId, $m['user_a'], $m['user_b']);
            Llamas::awardMatchRevealed($db, $m['user_a'], $m['user_b'], $roomId);
            Charisma::awardMatchRevealed($db, $m['user_a']);
            Charisma::awardMatchRevealed($db, $m['user_b']);
            Badges::grant($db, $m['user_a'], Badges::FIRST_MATCH);
            Badges::grant($db, $m['user_b'], Badges::FIRST_MATCH);
            self::pushPrivateEvent($db, $roomId, $m['user_a'], $m['user_b']);
            self::pushPrivateEvent($db, $roomId, $m['user_b'], $m['user_a']);
        }

        // 5. Limpiar señales (los datos sensibles ya no se necesitan)
        $db->prepare("DELETE FROM game_state WHERE room_id = ? AND state_key LIKE 'interest:%'")
           ->execute([$roomId]);

        return $matches;
    }

    // ─── Persistir match único (UNIQUE en (room, a, b) ordenados) ───────────
    private static function persistMatch(PDO $db, string $roomId, string $a, string $b): void {
        // Ordenar para que (a,b) y (b,a) se traten como mismo par
        if (strcmp($a, $b) > 0) [$a, $b] = [$b, $a];

        $id = self::uuid();
        try {
            $db->prepare(
                'INSERT INTO interest_matches (id, room_id, user_a_id, user_b_id) VALUES (?, ?, ?, ?)'
            )->execute([$id, $roomId, $a, $b]);
        } catch (\PDOException $e) {
            // Ya existía (UNIQUE) — ignorar
        }
    }

    // ─── Evento privado: solo el destinatario lo recibe en su poll ──────────
    private static function pushPrivateEvent(PDO $db, string $roomId, string $toUserId, string $matchedWith): void {
        $stmt = $db->prepare('SELECT username, avatar_url FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$matchedWith]);
        $other = $stmt->fetch();

        $db->prepare(
            'INSERT INTO game_events (room_id, event_type, payload, target_user_id)
             VALUES (?, ?, ?, ?)'
        )->execute([
            $roomId,
            'room:match_reveal',
            json_encode([
                'matchedWith' => $matchedWith,
                'username'    => $other['username'] ?? null,
                'avatarUrl'   => $other['avatar_url'] ?? null,
            ], JSON_UNESCAPED_UNICODE),
            $toUserId,
        ]);
    }

    // ─── Read/write helpers (game_state como key-value) ─────────────────────
    private static function readInterests(PDO $db, string $roomId, string $userId): array {
        $stmt = $db->prepare(
            'SELECT state_value FROM game_state WHERE room_id = ? AND state_key = ? LIMIT 1'
        );
        $stmt->execute([$roomId, "interest:{$userId}"]);
        $val = $stmt->fetchColumn();
        if (!$val) return [];
        $arr = json_decode($val, true);
        return is_array($arr) ? $arr : [];
    }

    private static function writeInterests(PDO $db, string $roomId, string $userId, array $targets): void {
        $key = "interest:{$userId}";
        $val = json_encode(array_values(array_unique($targets)), JSON_UNESCAPED_UNICODE);
        $db->prepare(
            'INSERT INTO game_state (room_id, state_key, state_value)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE state_value = VALUES(state_value)'
        )->execute([$roomId, $key, $val]);
    }

    private static function pairKey(string $a, string $b): string {
        return strcmp($a, $b) < 0 ? "$a|$b" : "$b|$a";
    }

    private static function uuid(): string {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff),
            mt_rand(0,0x0fff)|0x4000, mt_rand(0,0x3fff)|0x8000,
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff));
    }
}
