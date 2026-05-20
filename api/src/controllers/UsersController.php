<?php
namespace BF\Controllers;

use BF\{Database, Auth, Response, Llamas, Charisma, Badges};

class UsersController {
    // GET /api/users/me/profile — perfil completo propio
    public static function meProfile(): void {
        $payload = Auth::requireUser();
        $db      = Database::get();

        $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$payload['sub']]);
        $u = $stmt->fetch();
        if (!$u) Response::error('Usuario no encontrado', 404);

        Response::ok(self::buildProfile($db, $u, true));
    }

    // GET /api/users/:id/profile — perfil público de otro usuario
    public static function publicProfile(string $userId): void {
        Auth::requireUser();
        $db = Database::get();

        $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $u = $stmt->fetch();
        if (!$u) Response::error('Usuario no encontrado', 404);

        Response::ok(self::buildProfile($db, $u, false));
    }

    // GET /api/users/me/charisma — detalles de carisma + progreso
    public static function meCharisma(): void {
        $payload = Auth::requireUser();
        $db      = Database::get();

        $total    = Charisma::computeTotal($db, $payload['sub']);
        $rank     = Charisma::rankFromPoints($total);
        $progress = Charisma::progressToNext($total);

        $hist = $db->prepare(
            'SELECT old_rank, new_rank, changed_at FROM charisma_ranks
             WHERE user_id = ? ORDER BY changed_at DESC LIMIT 10'
        );
        $hist->execute([$payload['sub']]);

        $events = $db->prepare(
            'SELECT points, reason, created_at FROM charisma_events
             WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
        );
        $events->execute([$payload['sub']]);

        Response::ok([
            'total'        => $total,
            'rank'         => Charisma::rankInfo($rank),
            'progress'     => $progress,
            'rank_history' => $hist->fetchAll(),
            'recent'       => $events->fetchAll(),
        ]);
    }

    // GET /api/users/me/badges — insignias propias
    public static function meBadges(): void {
        $payload = Auth::requireUser();
        $db      = Database::get();
        Response::ok([
            'badges'  => Badges::userBadges($db, $payload['sub']),
            'catalog' => Badges::CATALOG,
        ]);
    }

    // ─── Helper privado: arma el perfil (público vs privado) ────────────────
    private static function buildProfile(\PDO $db, array $u, bool $isOwn): array {
        $charisma = (int)($u['charisma_points'] ?? 0);
        $rank     = Charisma::rankFromPoints($charisma);
        $progress = Charisma::progressToNext($charisma);
        $badges   = Badges::userBadges($db, $u['id']);

        $stats = self::stats($db, $u['id']);

        $public = [
            'id'             => $u['id'],
            'username'       => $u['username'],
            'avatarUrl'      => $u['avatar_url'],
            'isPremium'      => (bool)$u['is_premium'],
            'charismaPoints' => $charisma,
            'rank'           => Charisma::rankInfo($rank),
            'progress'       => $progress,
            'badges'         => $badges,
            'stats'          => $stats,
            'createdAt'      => $u['created_at'],
        ];

        if ($isOwn) {
            $public['email']         = $u['email'];
            $public['ageVerified']   = (bool)($u['age_verified'] ?? false);
            $public['referralCode']  = $u['referral_code'];
            $public['llamasBalance'] = Llamas::balance($db, $u['id']);
        }

        return $public;
    }

    private static function stats(\PDO $db, string $userId): array {
        $games = $db->prepare('SELECT COUNT(*) FROM charisma_events WHERE user_id = ? AND reason = ?');
        $games->execute([$userId, Charisma::R_GAME_COMPLETED]);

        $matches = $db->prepare(
            'SELECT COUNT(*) FROM interest_matches WHERE user_a_id = ? OR user_b_id = ?'
        );
        $matches->execute([$userId, $userId]);

        $referrals = $db->prepare('SELECT COUNT(*) FROM referrals WHERE referrer_id = ? AND rewarded_at IS NOT NULL');
        $referrals->execute([$userId]);

        return [
            'games_completed' => (int)$games->fetchColumn(),
            'matches_total'   => (int)$matches->fetchColumn(),
            'referrals'       => (int)$referrals->fetchColumn(),
        ];
    }
}
