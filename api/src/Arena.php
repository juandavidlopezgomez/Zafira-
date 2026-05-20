<?php
namespace BF;

use PDO;

/**
 * Arena: 9 features.
 * - Estado en arena_stadiums (sesión activa) + arena_events (acciones) + arena_votes
 * - epic_moments (Hall of Fame)
 * - Mínimo 5 participantes (regla #7)
 */
class Arena {
    public const MIN_PARTICIPANTS = 5;

    public const F_ESTADIO     = 'estadio';        // sala publica + spectators
    public const F_SILLA       = 'silla_caliente'; // hot seat 2 min
    public const F_SOBRE       = 'sobre_rojo';     // Premium - anonimo
    public const F_CORONA      = 'corona_semanal'; // top 3 weekly
    public const F_QUIEN       = 'quien_curso';    // who in this room
    public const F_TERMOMETRO  = 'termometro';     // group thermometer
    public const F_EPIC        = 'momento_epico';  // nominate epic moments
    public const F_RULETA      = 'ruleta';         // cursed wheel
    public const F_SHIPPER     = 'shipper';        // best ship vote

    public const PREMIUM_FEATURES = [self::F_SOBRE];

    // ─── Crear sesión (stadium) para una feature ────────────────────────────
    public static function startStadium(PDO $db, string $roomId, string $hostId, string $feature): string {
        $id = self::uuid();
        $db->prepare(
            'INSERT INTO arena_stadiums (id, room_id, host_id, feature, status, started_at)
             VALUES (?, ?, ?, ?, ?, NOW())'
        )->execute([$id, $roomId, $hostId, $feature, 'active']);
        return $id;
    }

    public static function endStadium(PDO $db, string $stadiumId): void {
        $db->prepare("UPDATE arena_stadiums SET status = 'finished', ended_at = NOW() WHERE id = ?")
           ->execute([$stadiumId]);
    }

    public static function getActiveStadium(PDO $db, string $roomId, string $feature): ?string {
        $stmt = $db->prepare(
            "SELECT id FROM arena_stadiums
             WHERE room_id = ? AND feature = ? AND status = 'active'
             ORDER BY started_at DESC LIMIT 1"
        );
        $stmt->execute([$roomId, $feature]);
        $id = $stmt->fetchColumn();
        return $id ? (string)$id : null;
    }

    // ─── Validaciones ───────────────────────────────────────────────────────
    public static function ensureMinParticipants(PDO $db, string $roomId): bool {
        $stmt = $db->prepare('SELECT COUNT(*) FROM room_players WHERE room_id = ?');
        $stmt->execute([$roomId]);
        return (int)$stmt->fetchColumn() >= self::MIN_PARTICIPANTS;
    }

    public static function isPremiumFeature(string $feature): bool {
        return in_array($feature, self::PREMIUM_FEATURES, true);
    }

    public static function userIsPremium(PDO $db, string $userId): bool {
        $stmt = $db->prepare('SELECT is_premium FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        return (bool)$stmt->fetchColumn();
    }

    // ─── Eventos arena ──────────────────────────────────────────────────────
    public static function addEvent(PDO $db, string $stadiumId, string $type, ?string $userId, array $payload): string {
        $id = self::uuid();
        $db->prepare(
            'INSERT INTO arena_events (id, stadium_id, event_type, initiated_by, payload)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$id, $stadiumId, $type, $userId, json_encode($payload, JSON_UNESCAPED_UNICODE)]);
        return $id;
    }

    // ─── Voto registrado ────────────────────────────────────────────────────
    public static function vote(
        PDO $db,
        string $stadiumId,
        ?string $eventId,
        string $voterId,
        ?string $targetId,
        string $voteType,
        ?int $value = null
    ): void {
        // UPSERT por event_id + voter_id (soporta cambio de voto)
        $check = $db->prepare(
            'SELECT id FROM arena_votes WHERE event_id <=> ? AND voter_id = ? AND vote_type = ? LIMIT 1'
        );
        $check->execute([$eventId, $voterId, $voteType]);
        $existing = $check->fetchColumn();

        if ($existing) {
            $db->prepare('UPDATE arena_votes SET target_id = ?, value = ? WHERE id = ?')
               ->execute([$targetId, $value, $existing]);
        } else {
            $id = self::uuid();
            $db->prepare(
                'INSERT INTO arena_votes (id, stadium_id, event_id, voter_id, target_id, vote_type, value)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            )->execute([$id, $stadiumId, $eventId, $voterId, $targetId, $voteType, $value]);
        }
    }

    // ─── Tally de votos por target ──────────────────────────────────────────
    public static function tally(PDO $db, string $stadiumId, ?string $eventId, string $voteType): array {
        $stmt = $db->prepare(
            'SELECT target_id, COUNT(*) as cnt, AVG(value) as avg_value
             FROM arena_votes
             WHERE stadium_id = ? AND event_id <=> ? AND vote_type = ?
             GROUP BY target_id ORDER BY cnt DESC'
        );
        $stmt->execute([$stadiumId, $eventId, $voteType]);
        return $stmt->fetchAll();
    }

    // ─── Corona Semanal: top 3 por carisma últimos 7 días ───────────────────
    public static function weeklyTop3(PDO $db): array {
        $stmt = $db->query(
            'SELECT u.id, u.username, u.avatar_url, COALESCE(SUM(ce.points), 0) as weekly_points
             FROM users u
             LEFT JOIN charisma_events ce
               ON ce.user_id = u.id AND ce.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
             GROUP BY u.id, u.username, u.avatar_url
             HAVING weekly_points > 0
             ORDER BY weekly_points DESC LIMIT 3'
        );
        $rows = $stmt->fetchAll();
        return array_map(static fn(array $r, int $i) => [
            'position'      => $i + 1,
            'userId'        => $r['id'],
            'username'      => $r['username'],
            'avatarUrl'     => $r['avatar_url'],
            'weeklyPoints'  => (int)$r['weekly_points'],
        ], $rows, array_keys($rows));
    }

    // ─── Premiar corona semanal a top 3 (idempotente por semana) ────────────
    public static function awardWeeklyCrown(PDO $db): array {
        // Marcador para no duplicar premios la misma semana
        $weekKey = 'corona_week_' . date('o-W'); // ISO year-week
        $check = $db->prepare(
            "SELECT 1 FROM llamas_transactions WHERE reason = 'weekly_crown_1' AND DATE(created_at) > DATE_SUB(NOW(), INTERVAL 7 DAY) LIMIT 1"
        );
        $check->execute();
        if ($check->fetch()) return [];

        $top3 = self::weeklyTop3($db);
        foreach ($top3 as $r) {
            Llamas::awardWeeklyCrown($db, $r['userId'], $r['position']);
            Badges::grant($db, $r['userId'], Badges::WEEKLY_CROWN);
        }
        return $top3;
    }

    // ─── Ruleta Maldita: efecto aleatorio ───────────────────────────────────
    public static function ruletaSpin(): array {
        $opts = [
            ['effect' => 'lose_llamas',       'label' => 'Pierdes 20 LLAMAS',              'llamasDelta' => -20, 'weight' => 15],
            ['effect' => 'gain_llamas',       'label' => 'Ganas 30 LLAMAS',                'llamasDelta' =>  30, 'weight' => 12],
            ['effect' => 'gain_big',          'label' => '¡JACKPOT! Ganas 100 LLAMAS',     'llamasDelta' => 100, 'weight' =>  3],
            ['effect' => 'group_question',    'label' => 'El grupo te hace una pregunta',  'llamasDelta' =>   0, 'weight' => 18],
            ['effect' => 'double_points',     'label' => 'Duplica tus próximos puntos',    'llamasDelta' =>   0, 'weight' => 10],
            ['effect' => 'special_challenge', 'label' => 'Reto especial del Hilo Oscuro',  'llamasDelta' =>   0, 'weight' => 12],
            ['effect' => 'silence',           'label' => 'No puedes hablar 1 ronda',       'llamasDelta' =>   0, 'weight' => 12],
            ['effect' => 'truth_extreme',     'label' => 'Verdad extrema obligatoria',     'llamasDelta' =>   0, 'weight' => 10],
            ['effect' => 'safe',              'label' => 'Te salvas... esta vez',          'llamasDelta' =>   0, 'weight' =>  8],
        ];
        return self::weightedPick($opts);
    }

    private static function weightedPick(array $items): array {
        $totalWeight = array_sum(array_column($items, 'weight'));
        $r = mt_rand(1, $totalWeight);
        $acc = 0;
        foreach ($items as $item) {
            $acc += $item['weight'];
            if ($r <= $acc) return $item;
        }
        return $items[0];
    }

    // ─── Premio shipper: ambos shipeados reciben LLAMAS ─────────────────────
    public static function rewardShip(PDO $db, string $a, string $b, string $stadiumId): void {
        Llamas::credit($db, $a, 75, 'shipper_winner', ['shipped_with' => $b], $stadiumId);
        Llamas::credit($db, $b, 75, 'shipper_winner', ['shipped_with' => $a], $stadiumId);
        Charisma::award($db, $a, 15, 'shipper_winner');
        Charisma::award($db, $b, 15, 'shipper_winner');
    }

    public static function uuid(): string {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff),
            mt_rand(0,0x0fff)|0x4000, mt_rand(0,0x3fff)|0x8000,
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff));
    }
}
