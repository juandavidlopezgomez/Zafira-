<?php
namespace BF;

use PDO;

class Charisma {
    // ─── Rangos: 5 niveles ──────────────────────────────────────────────────
    public const RANKS = [
        1 => ['name' => 'Spark',   'min' => 0,     'max' => 499,    'color' => '#9CA3AF'],
        2 => ['name' => 'Flame',   'min' => 500,   'max' => 1999,   'color' => '#FF6B00'],
        3 => ['name' => 'Blaze',   'min' => 2000,  'max' => 4999,   'color' => '#FF2D55'],
        4 => ['name' => 'Inferno', 'min' => 5000,  'max' => 9999,   'color' => '#7F1D1D'],
        5 => ['name' => 'Legend',  'min' => 10000, 'max' => 999999, 'color' => '#FFD700'],
    ];

    // ─── Razones de eventos de carisma ──────────────────────────────────────
    public const R_GAME_COMPLETED  = 'game_completed';     // +10
    public const R_CHALLENGE_TAKEN = 'challenge_taken';    // +5
    public const R_MATCH_REVEALED  = 'match_revealed';     // +15
    public const R_VOTED_BEST      = 'voted_best';         // +20 mejor actor / silla / etc.
    public const R_EPIC_MOMENT     = 'epic_moment';        // +25 nominado y confirmado
    public const R_HOST_GAME       = 'host_game';          // +5 hostear partida

    // ─── Cantidades estandarizadas ──────────────────────────────────────────
    public const A_GAME_COMPLETED  = 10;
    public const A_CHALLENGE_TAKEN = 5;
    public const A_MATCH_REVEALED  = 15;
    public const A_VOTED_BEST      = 20;
    public const A_EPIC_MOMENT     = 25;
    public const A_HOST_GAME       = 5;

    // ─── Otorgar puntos + chequear subida de rango ──────────────────────────
    // Devuelve ['old_rank' => N, 'new_rank' => M, 'level_up' => bool]
    public static function award(PDO $db, string $userId, int $points, string $reason): array {
        if ($points <= 0) {
            return ['old_rank' => 0, 'new_rank' => 0, 'level_up' => false];
        }

        // 1. Insertar evento
        $eventId = self::uuid();
        $db->prepare(
            'INSERT INTO charisma_events (id, user_id, points, reason) VALUES (?, ?, ?, ?)'
        )->execute([$eventId, $userId, $points, $reason]);

        // 2. Recalcular total + rango anterior
        $stmt = $db->prepare('SELECT charisma_points, current_rank FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $u = $stmt->fetch();
        $oldRank = (int)($u['current_rank'] ?? 1);

        $newTotal = self::computeTotal($db, $userId);
        $newRank  = self::rankFromPoints($newTotal);

        // 3. Actualizar columna desnormalizada (cache; siempre validable contra ledger)
        $db->prepare('UPDATE users SET charisma_points = ?, current_rank = ? WHERE id = ?')
           ->execute([$newTotal, $newRank, $userId]);

        // 4. Si subió de rango: registrar histórico + recompensa LLAMAS
        $levelUp = $newRank > $oldRank;
        if ($levelUp) {
            $rid = self::uuid();
            $db->prepare(
                'INSERT INTO charisma_ranks (id, user_id, old_rank, new_rank) VALUES (?, ?, ?, ?)'
            )->execute([$rid, $userId, $oldRank, $newRank]);

            Llamas::awardRankUp($db, $userId, $newRank);
            Badges::checkRankBadges($db, $userId, $newRank);
        }

        // 5. Chequear insignias por puntos totales
        Badges::checkCharismaBadges($db, $userId, $newTotal);

        return [
            'old_rank' => $oldRank,
            'new_rank' => $newRank,
            'level_up' => $levelUp,
            'total'    => $newTotal,
        ];
    }

    // ─── Total acumulado desde events (verdad) ──────────────────────────────
    public static function computeTotal(PDO $db, string $userId): int {
        $stmt = $db->prepare('SELECT COALESCE(SUM(points), 0) FROM charisma_events WHERE user_id = ?');
        $stmt->execute([$userId]);
        return (int) $stmt->fetchColumn();
    }

    // ─── Rango calculado desde puntos ───────────────────────────────────────
    public static function rankFromPoints(int $points): int {
        foreach (self::RANKS as $level => $cfg) {
            if ($points >= $cfg['min'] && $points <= $cfg['max']) {
                return $level;
            }
        }
        return 5; // > 10000
    }

    // ─── Info completa del rango ────────────────────────────────────────────
    public static function rankInfo(int $level): array {
        $r = self::RANKS[$level] ?? self::RANKS[1];
        return [
            'level' => $level,
            'name'  => $r['name'],
            'color' => $r['color'],
            'min'   => $r['min'],
            'max'   => $r['max'],
        ];
    }

    // ─── Progreso al siguiente rango (0-100%) ───────────────────────────────
    public static function progressToNext(int $points): array {
        $rank = self::rankFromPoints($points);
        if ($rank >= 5) {
            return ['rank' => 5, 'progress' => 100, 'next_at' => null, 'remaining' => 0];
        }
        $cfg = self::RANKS[$rank];
        $nextAt = self::RANKS[$rank + 1]['min'];
        $progress = (int) round((($points - $cfg['min']) / ($nextAt - $cfg['min'])) * 100);
        return [
            'rank'      => $rank,
            'progress'  => max(0, min(100, $progress)),
            'next_at'   => $nextAt,
            'remaining' => max(0, $nextAt - $points),
        ];
    }

    // ─── Helpers convenientes ───────────────────────────────────────────────
    public static function awardGameCompleted(PDO $db, string $userId): array {
        return self::award($db, $userId, self::A_GAME_COMPLETED, self::R_GAME_COMPLETED);
    }
    public static function awardChallengeTaken(PDO $db, string $userId): array {
        return self::award($db, $userId, self::A_CHALLENGE_TAKEN, self::R_CHALLENGE_TAKEN);
    }
    public static function awardMatchRevealed(PDO $db, string $userId): array {
        return self::award($db, $userId, self::A_MATCH_REVEALED, self::R_MATCH_REVEALED);
    }
    public static function awardEpicMoment(PDO $db, string $userId): array {
        return self::award($db, $userId, self::A_EPIC_MOMENT, self::R_EPIC_MOMENT);
    }

    private static function uuid(): string {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff),
            mt_rand(0,0x0fff)|0x4000, mt_rand(0,0x3fff)|0x8000,
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff));
    }
}
