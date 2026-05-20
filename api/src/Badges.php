<?php
namespace BF;

use PDO;

class Badges {
    // ─── Tipos de insignia ──────────────────────────────────────────────────
    public const FIRST_MATCH       = 'first_match';
    public const TEN_GAMES         = 'ten_games';
    public const FIFTY_GAMES       = 'fifty_games';
    public const HUNDRED_GAMES     = 'hundred_games';
    public const DARK_UNLOCKED     = 'dark_unlocked';
    public const LLAMAS_MILLIONAIRE = 'llamas_millionaire'; // 1M LLAMAS acumuladas
    public const LLAMAS_RICH       = 'llamas_rich';        // 10k LLAMAS acumuladas
    public const RANK_FLAME        = 'rank_flame';   // alcanza rango 2
    public const RANK_BLAZE        = 'rank_blaze';   // rango 3
    public const RANK_INFERNO      = 'rank_inferno'; // rango 4
    public const RANK_LEGEND       = 'rank_legend';  // rango 5
    public const FIRST_REFERRAL    = 'first_referral';
    public const TEN_REFERRALS     = 'ten_referrals';
    public const HOST_FIRST        = 'host_first_room';
    public const WEEKLY_CROWN      = 'weekly_crown';
    public const EPIC_MOMENT       = 'epic_moment_confirmed';

    // ─── Catálogo: nombre + descripción + ícono ─────────────────────────────
    public const CATALOG = [
        self::FIRST_MATCH        => ['name' => 'Primer Match',         'desc' => 'Tu primer match revelado',                'icon' => '💞'],
        self::TEN_GAMES          => ['name' => 'Veterano',              'desc' => '10 partidas completadas',                  'icon' => '🎮'],
        self::FIFTY_GAMES        => ['name' => 'Adicto',                'desc' => '50 partidas completadas',                  'icon' => '🔥'],
        self::HUNDRED_GAMES      => ['name' => 'Leyenda Viviente',      'desc' => '100 partidas completadas',                 'icon' => '👑'],
        self::DARK_UNLOCKED      => ['name' => 'Lado Oscuro',           'desc' => 'Modo Oscuro desbloqueado',                 'icon' => '🌑'],
        self::LLAMAS_MILLIONAIRE => ['name' => 'LLAMAS Millonario',     'desc' => '1.000.000 de LLAMAS acumuladas',           'icon' => '💰'],
        self::LLAMAS_RICH        => ['name' => 'Bolsillo Caliente',     'desc' => '10.000 LLAMAS acumuladas',                 'icon' => '💵'],
        self::RANK_FLAME         => ['name' => 'Llama Encendida',       'desc' => 'Alcanzaste rango Flame',                   'icon' => '🔥'],
        self::RANK_BLAZE         => ['name' => 'Hoguera',               'desc' => 'Alcanzaste rango Blaze',                   'icon' => '🌋'],
        self::RANK_INFERNO       => ['name' => 'Infierno',              'desc' => 'Alcanzaste rango Inferno',                 'icon' => '😈'],
        self::RANK_LEGEND        => ['name' => 'Leyenda',               'desc' => 'Alcanzaste rango Legend (10K+ carisma)',   'icon' => '⭐'],
        self::FIRST_REFERRAL     => ['name' => 'Reclutador',            'desc' => 'Tu primer referido jugó',                  'icon' => '🤝'],
        self::TEN_REFERRALS      => ['name' => 'Influencer',            'desc' => '10 referidos activos',                     'icon' => '📣'],
        self::HOST_FIRST         => ['name' => 'Anfitrión',             'desc' => 'Hospedaste tu primera sala',               'icon' => '🏠'],
        self::WEEKLY_CROWN       => ['name' => 'Corona Semanal',        'desc' => 'Top 3 de la semana',                       'icon' => '👑'],
        self::EPIC_MOMENT        => ['name' => 'Momento Épico',         'desc' => 'Tu momento épico fue confirmado',          'icon' => '✨'],
    ];

    // ─── Otorga si no existe; idempotente ───────────────────────────────────
    public static function grant(PDO $db, string $userId, string $type): bool {
        if (!isset(self::CATALOG[$type])) return false;
        try {
            $check = $db->prepare('SELECT 1 FROM badges WHERE user_id = ? AND badge_type = ? LIMIT 1');
            $check->execute([$userId, $type]);
            if ($check->fetch()) return false;

            $id = self::uuid();
            $db->prepare('INSERT INTO badges (id, user_id, badge_type) VALUES (?, ?, ?)')
               ->execute([$id, $userId, $type]);
            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    // ─── Lista de insignias del usuario ─────────────────────────────────────
    public static function userBadges(PDO $db, string $userId): array {
        try {
            $stmt = $db->prepare('SELECT badge_type, earned_at FROM badges WHERE user_id = ? ORDER BY earned_at DESC');
            $stmt->execute([$userId]);
            $rows = $stmt->fetchAll();
        } catch (\Throwable $e) {
            return [];
        }
        return array_map(static function (array $r): array {
            $meta = self::CATALOG[$r['badge_type']] ?? ['name' => $r['badge_type'], 'desc' => '', 'icon' => '🏅'];
            return [
                'type'      => $r['badge_type'],
                'name'      => $meta['name'],
                'desc'      => $meta['desc'],
                'icon'      => $meta['icon'],
                'earned_at' => $r['earned_at'],
            ];
        }, $rows);
    }

    // ─── Chequea insignias relacionadas con carisma total ───────────────────
    public static function checkCharismaBadges(PDO $db, string $userId, int $totalPoints): void {
        // Las de rango se otorgan vía checkRankBadges
        // Aquí podríamos chequear hitos de partidas, etc. Hacemos las dependientes de partidas:
        $stmt = $db->prepare('SELECT COUNT(*) FROM charisma_events WHERE user_id = ? AND reason = ?');
        $stmt->execute([$userId, Charisma::R_GAME_COMPLETED]);
        $games = (int) $stmt->fetchColumn();

        if ($games >= 100)  self::grant($db, $userId, self::HUNDRED_GAMES);
        elseif ($games >= 50) self::grant($db, $userId, self::FIFTY_GAMES);
        elseif ($games >= 10) self::grant($db, $userId, self::TEN_GAMES);
    }

    // ─── Insignias por rango alcanzado ──────────────────────────────────────
    public static function checkRankBadges(PDO $db, string $userId, int $rank): void {
        if ($rank >= 5) self::grant($db, $userId, self::RANK_LEGEND);
        if ($rank >= 4) self::grant($db, $userId, self::RANK_INFERNO);
        if ($rank >= 3) self::grant($db, $userId, self::RANK_BLAZE);
        if ($rank >= 2) self::grant($db, $userId, self::RANK_FLAME);
    }

    // ─── Insignias relacionadas con LLAMAS acumuladas ───────────────────────
    public static function checkLlamasBadges(PDO $db, string $userId): void {
        $stmt = $db->prepare(
            'SELECT COALESCE(SUM(amount), 0) FROM llamas_transactions WHERE user_id = ? AND amount > 0'
        );
        $stmt->execute([$userId]);
        $totalEarned = (int) $stmt->fetchColumn();

        if ($totalEarned >= 1_000_000) self::grant($db, $userId, self::LLAMAS_MILLIONAIRE);
        if ($totalEarned >= 10_000)    self::grant($db, $userId, self::LLAMAS_RICH);
    }

    // ─── Insignias por número de referidos ──────────────────────────────────
    public static function checkReferralBadges(PDO $db, string $userId): void {
        $stmt = $db->prepare('SELECT COUNT(*) FROM referrals WHERE referrer_id = ? AND rewarded_at IS NOT NULL');
        $stmt->execute([$userId]);
        $n = (int) $stmt->fetchColumn();
        if ($n >= 10) self::grant($db, $userId, self::TEN_REFERRALS);
        if ($n >= 1)  self::grant($db, $userId, self::FIRST_REFERRAL);
    }

    private static function uuid(): string {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff),
            mt_rand(0,0x0fff)|0x4000, mt_rand(0,0x3fff)|0x8000,
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff));
    }
}
