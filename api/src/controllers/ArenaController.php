<?php
namespace BF\Controllers;

use BF\{Database, Auth, Response};

class ArenaController {
    private const MIN_PARTICIPANTS = 5;
    private const PREMIUM_FEATURES = ['sobre_rojo'];

    public static function startFeature(string $roomId): never {
        $payload = Auth::requireUser();
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];
        $feature = $body['feature'] ?? '';
        $db      = Database::get();

        $players = RoomsController::getPlayers($db, $roomId);
        if (count($players) < self::MIN_PARTICIPANTS) {
            Response::error('Arena requiere mínimo ' . self::MIN_PARTICIPANTS . ' participantes');
        }

        $stmt = $db->prepare('SELECT is_premium FROM rooms WHERE id = ? LIMIT 1');
        $stmt->execute([$roomId]);
        $isPremium = (bool)($stmt->fetchColumn());

        if (in_array($feature, self::PREMIUM_FEATURES, true) && !$isPremium) {
            Response::error("{$feature} requiere sala Premium");
        }

        $id = self::uuid();
        $db->prepare(
            'INSERT INTO arena_stadiums (id, room_id, feature, status, started_at) VALUES (?,?,?,?,NOW())'
        )->execute([$id, $roomId, $feature, 'active']);

        Response::ok([
            'stadiumId' => $id,
            'feature'   => $feature,
            'players'   => array_column($players, 'id'),
        ]);
    }

    public static function vote(string $stadiumId): never {
        $payload  = Auth::requireUser();
        $body     = json_decode(file_get_contents('php://input'), true) ?? [];
        $targetId = $body['targetId'] ?? null;
        $voteType = $body['voteType'] ?? 'default';
        $db       = Database::get();

        $stmt = $db->prepare(
            'SELECT id FROM arena_votes WHERE stadium_id=? AND voter_id=? AND vote_type=? LIMIT 1'
        );
        $stmt->execute([$stadiumId, $payload['sub'], $voteType]);
        $existing = $stmt->fetchColumn();

        if ($existing) {
            $db->prepare('UPDATE arena_votes SET target_id=? WHERE id=?')
               ->execute([$targetId, $existing]);
        } else {
            $id = self::uuid();
            $db->prepare(
                'INSERT INTO arena_votes (id, stadium_id, voter_id, target_id, vote_type) VALUES (?,?,?,?,?)'
            )->execute([$id, $stadiumId, $payload['sub'], $targetId, $voteType]);
        }

        $stmt = $db->prepare('SELECT COUNT(*) FROM arena_votes WHERE stadium_id=? AND vote_type=?');
        $stmt->execute([$stadiumId, $voteType]);
        $count = (int)$stmt->fetchColumn();

        Response::ok(['count' => $count]);
    }

    public static function results(string $stadiumId): never {
        Auth::requireUser();
        $db   = Database::get();
        $stmt = $db->prepare('SELECT target_id, COUNT(*) as cnt FROM arena_votes WHERE stadium_id=? GROUP BY target_id ORDER BY cnt DESC');
        $stmt->execute([$stadiumId]);
        $rows = $stmt->fetchAll();

        $distribution = [];
        foreach ($rows as $r) {
            if ($r['target_id']) $distribution[$r['target_id']] = (int)$r['cnt'];
        }
        $winner = array_key_first($distribution);

        Response::ok(['distribution' => $distribution, 'winner' => $winner]);
    }

    public static function end(string $stadiumId): never {
        Auth::requireUser();
        $db = Database::get();
        $db->prepare('UPDATE arena_stadiums SET status=?, ended_at=NOW() WHERE id=?')
           ->execute(['finished', $stadiumId]);
        Response::ok(null);
    }

    public static function spinRuleta(): never {
        Auth::requireUser();
        $opts = [
            ['label' => 'Pierde 20 LLAMAS',              'effect' => 'lose_llamas',       'llamasDelta' => -20],
            ['label' => 'El grupo te hace una pregunta',  'effect' => 'group_question',    'llamasDelta' =>   0],
            ['label' => 'Duplica tus puntos',             'effect' => 'double_points',     'llamasDelta' =>   0],
            ['label' => 'Reto especial',                  'effect' => 'special_challenge', 'llamasDelta' =>   0],
            ['label' => 'Gana 15 LLAMAS',                 'effect' => 'gain_llamas',       'llamasDelta' =>  15],
        ];
        Response::ok($opts[array_rand($opts)]);
    }

    private static function uuid(): string {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0,0xffff),mt_rand(0,0xffff),mt_rand(0,0xffff),
            mt_rand(0,0x0fff)|0x4000,mt_rand(0,0x3fff)|0x8000,
            mt_rand(0,0xffff),mt_rand(0,0xffff),mt_rand(0,0xffff));
    }
}
