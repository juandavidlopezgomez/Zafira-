<?php
namespace BF\Controllers;

use BF\{Database, Auth, Response};

/**
 * Maneja todos los eventos de juego vía POST /api/game/{roomId}/action
 * y el polling de eventos vía GET /api/game/{roomId}/events
 */
class GameController {
    public static function action(string $roomId): never {
        $payload = Auth::requireUser();
        $userId  = $payload['sub'];
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];
        $event   = $body['event'] ?? '';
        $data    = $body['payload'] ?? [];
        $db      = Database::get();

        // Heartbeat en cada acción
        $db->prepare('UPDATE room_players SET last_seen = NOW() WHERE room_id = ? AND user_id = ?')
           ->execute([$roomId, $userId]);

        $result = match($event) {
            'room:join'         => self::roomJoin($db, $roomId, $userId),
            'room:leave'        => self::roomLeave($db, $roomId, $userId),
            'game:ready'        => self::gameReady($db, $roomId, $userId),
            'game:start'        => self::gameStart($db, $roomId, $userId),
            'game:mark_interest'=> self::markInterest($db, $roomId, $userId, $data['targetId'] ?? ''),
            'game:end'          => self::gameEnd($db, $roomId, $userId),

            'bottle:spin'       => self::bottleSpin($db, $roomId, $userId),

            'truth_dare:choose' => self::truthDareChoose($db, $roomId, $userId, $data['choice'] ?? ''),
            'truth_dare:skip'   => self::truthDareSkip($db, $roomId, $data['roundId'] ?? ''),
            'truth_dare:vote'   => self::truthDareVote($db, $roomId, $userId, $data),

            'juicio:start'      => self::juicioStart($db, $roomId, $userId, $data['accusedId'] ?? ''),
            'juicio:predict'    => self::juicioPredict($db, $roomId, $userId, $data),
            'juicio:vote'       => self::juicioVote($db, $roomId, $userId, $data),
            'juicio:reveal'     => self::juicioReveal($db, $roomId, $data['sessionId'] ?? ''),

            'termometro:start'  => self::termometroStart($db, $roomId),
            'termometro:position'=> self::termometroPosition($db, $roomId, $userId, $data),
            'termometro:reveal' => self::termometroReveal($db, $roomId, $data['questionId'] ?? ''),

            'todo_nada:start'   => self::todoNadaStart($db, $roomId, $userId, $data),
            'todo_nada:vote'    => self::todoNadaVote($db, $roomId, $userId, $data),
            'todo_nada:resolve' => self::todoNadaResolve($db, $roomId, $userId, $data),

            'battle_1v1:start'  => self::battle1v1Start($db, $roomId, $userId, $data),
            'battle_1v1:vote'   => self::battle1v1Vote($db, $roomId, $userId, $data),

            'liga:next_round'   => self::ligaNextRound($db, $roomId, $userId),
            'liga:vote'         => self::ligaVote($db, $roomId, $userId, $data),
            'liga:results'      => self::ligaResults($db, $roomId),

            'juicio:results'    => self::juicioReveal($db, $roomId, $data['sessionId'] ?? ''),

            'actores:assign_roles' => self::actoresAssign($db, $roomId, $userId),
            'actores:my_role'      => self::actoresMyRole($db, $roomId, $userId),
            'actores:vote_best'    => self::actoresVoteBest($db, $roomId, $userId, $data),
            'actores:guess_roles'  => self::actoresGuessRoles($db, $roomId, $userId, $data),
            'actores:reveal'       => self::actoresReveal($db, $roomId),

            'oscuro:get_challenge' => self::oscuroGetChallenge($db, $roomId, $userId, $data),
            'oscuro:react'         => self::oscuroReact($db, $roomId, $userId, $data),

            'cartas:deal'          => self::cartasDeal($db, $roomId, $userId),
            'cartas:play'          => self::cartasPlay($db, $roomId, $userId, $data),
            'cartas:vote'          => self::cartasVote($db, $roomId, $userId, $data),
            'cartas:resolve'       => self::cartasResolve($db, $roomId),

            'ultimo_pie:start'     => self::ultimoPieStart($db, $roomId, $userId),
            'ultimo_pie:vote'      => self::ultimoPieVote($db, $roomId, $userId, $data),
            'ultimo_pie:results'   => self::ultimoPieResults($db, $roomId, $data),
            'ultimo_pie:salvation' => self::ultimoPieSalvation($db, $roomId, $userId, $data),

            default             => ['success' => false, 'error' => "Evento desconocido: {$event}"],
        };

        Response::json($result);
    }

    public static function events(string $roomId): never {
        $payload = Auth::requireUser();
        $userId  = $payload['sub'];
        $since   = (int)($_GET['since'] ?? 0);
        $db      = Database::get();

        // Heartbeat
        $db->prepare('UPDATE room_players SET last_seen = NOW() WHERE room_id = ? AND user_id = ?')
           ->execute([$roomId, $userId]);

        $stmt = $db->prepare(
            'SELECT id, event_type, payload, created_at FROM game_events
             WHERE room_id = ?
               AND id > ?
               AND (target_user_id IS NULL OR target_user_id = ?)
             ORDER BY id ASC
             LIMIT 50'
        );
        $stmt->execute([$roomId, $since, $userId]);
        $rows = $stmt->fetchAll();

        $events = array_map(fn($r) => [
            'id'      => (int)$r['id'],
            'type'    => $r['event_type'],
            'payload' => json_decode($r['payload'], true),
        ], $rows);

        Response::ok(['events' => $events]);
    }

    // ─── Room ────────────────────────────────────────────────────────────────
    private static function roomJoin(\PDO $db, string $roomId, string $userId): array {
        $stmt = $db->prepare('SELECT * FROM rooms WHERE id = ? LIMIT 1');
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();
        if (!$room) return ['success' => false, 'error' => 'Sala no encontrada'];

        $players = RoomsController::getPlayers($db, $roomId);
        return ['success' => true, 'data' => [
            'roomId'  => $roomId,
            'players' => $players,
            'mode'    => $room['mode'],
            'status'  => $room['status'],
        ]];
    }

    private static function roomLeave(\PDO $db, string $roomId, string $userId): array {
        $db->prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?')
           ->execute([$roomId, $userId]);
        RoomsController::pushEvent($db, $roomId, 'room:player_left', ['userId' => $userId]);
        return ['success' => true, 'data' => null];
    }

    private static function gameReady(\PDO $db, string $roomId, string $userId): array {
        self::setState($db, $roomId, "ready:{$userId}", '1', 300);
        return ['success' => true, 'data' => null];
    }

    private static function gameStart(\PDO $db, string $roomId, string $userId): array {
        $stmt = $db->prepare('SELECT * FROM rooms WHERE id = ? AND host_id = ? LIMIT 1');
        $stmt->execute([$roomId, $userId]);
        if (!$stmt->fetch()) return ['success' => false, 'error' => 'Solo el host puede iniciar'];

        $db->prepare('UPDATE rooms SET status = ? WHERE id = ?')
           ->execute(['active', $roomId]);
        RoomsController::pushEvent($db, $roomId, 'game:started', ['mode' => self::getMode($db, $roomId)]);
        return ['success' => true, 'data' => null];
    }

    private static function markInterest(\PDO $db, string $roomId, string $userId, string $targetId): array {
        self::setState($db, $roomId, "interest:{$userId}:{$targetId}", '1', 7200);
        return ['success' => true, 'data' => null];
    }

    private static function gameEnd(\PDO $db, string $roomId, string $userId): array {
        $stmt = $db->prepare('SELECT * FROM rooms WHERE id = ? AND host_id = ? LIMIT 1');
        $stmt->execute([$roomId, $userId]);
        if (!$stmt->fetch()) return ['success' => false, 'error' => 'Solo el host puede terminar'];

        $players = RoomsController::getPlayers($db, $roomId);
        $playerIds = array_column($players, 'id');
        $matches = [];

        foreach ($playerIds as $fromId) {
            foreach ($playerIds as $toId) {
                if ($fromId >= $toId) continue;
                $a = self::getState($db, $roomId, "interest:{$fromId}:{$toId}");
                $b = self::getState($db, $roomId, "interest:{$toId}:{$fromId}");
                if ($a && $b) {
                    $matches[] = ['fromId' => $fromId, 'toId' => $toId];
                    RoomsController::pushEvent($db, $roomId, 'room:match_reveal', ['matchedWith' => $toId], $fromId);
                    RoomsController::pushEvent($db, $roomId, 'room:match_reveal', ['matchedWith' => $fromId], $toId);
                }
            }
        }

        $db->prepare('UPDATE rooms SET status = ? WHERE id = ?')->execute(['finished', $roomId]);
        return ['success' => true, 'data' => ['matches' => count($matches)]];
    }

    // ─── Botella ─────────────────────────────────────────────────────────────
    private static function bottleSpin(\PDO $db, string $roomId, string $userId): array {
        $players = RoomsController::getPlayers($db, $roomId);
        if (count($players) < 2) return ['success' => false, 'error' => 'Se necesitan al menos 2 jugadores'];

        $others  = array_filter($players, fn($p) => $p['id'] !== $userId);
        $target  = $others[array_rand($others)];
        $degrees = random_int(720, 1440) + (array_search($target, array_values($others)) / count($others)) * 360;

        $result = ['targetId' => $target['id'], 'targetUsername' => $target['username'], 'degrees' => $degrees];
        RoomsController::pushEvent($db, $roomId, 'bottle:result', $result);
        return ['success' => true, 'data' => $result];
    }

    // ─── Truth or Dare ───────────────────────────────────────────────────────
    private static function truthDareChoose(\PDO $db, string $roomId, string $userId, string $choice): array {
        $challenges = [
            'truth' => [
                '¿Cuál es tu mayor secreto?', '¿Con quién tienes química aquí?',
                '¿Has mentido hoy?', '¿A quién mandarías un mensaje ahora mismo?',
                '¿Cuál es tu mayor miedo?', '¿Has tenido sentimientos por alguien del grupo?',
            ],
            'dare' => [
                'Baila 30 segundos sin música', 'Llama a alguien y canta una canción',
                'Haz 10 sentadillas ahora', 'Muestra el último emoji que enviaste',
                'Imita a alguien del grupo', 'Di algo que nunca le dirías a alguien de aquí',
            ],
        ];
        $list = $challenges[$choice] ?? $challenges['truth'];
        $text = $list[array_rand($list)];
        $roundId = self::genId();

        self::setState($db, $roomId, "td_round:{$roundId}", json_encode([
            'userId' => $userId, 'choice' => $choice, 'text' => $text
        ]), 600);

        return ['success' => true, 'data' => ['roundId' => $roundId, 'challenge' => $text, 'type' => $choice]];
    }

    private static function truthDareSkip(\PDO $db, string $roomId, string $roundId): array {
        self::deleteState($db, $roomId, "td_round:{$roundId}");
        return ['success' => true, 'data' => null];
    }

    private static function truthDareVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $roundId = $data['roundId'] ?? '';
        $vote    = $data['vote'] ?? '';
        self::setState($db, $roomId, "td_vote:{$roundId}:{$userId}", $vote, 300);
        $count = self::countStatePattern($db, $roomId, "td_vote:{$roundId}:");
        return ['success' => true, 'data' => ['voteCount' => $count]];
    }

    // ─── El Juicio ───────────────────────────────────────────────────────────
    private static function juicioStart(\PDO $db, string $roomId, string $userId, string $accusedId): array {
        $accusations = [
            '¿Es capaz de besar a alguien del grupo?',
            '¿Ha copiado en un examen?', '¿Miente a sus amigos seguido?',
            '¿Le gusta alguien de aquí?', '¿Haría algo loco por impresionar?',
        ];
        $question  = $accusations[array_rand($accusations)];
        $sessionId = self::genId();

        self::setState($db, $roomId, "juicio:{$sessionId}", json_encode([
            'accusedId' => $accusedId, 'question' => $question
        ]), 600);

        return ['success' => true, 'data' => ['sessionId' => $sessionId, 'accusedId' => $accusedId, 'question' => $question]];
    }

    private static function juicioPredict(\PDO $db, string $roomId, string $userId, array $data): array {
        $sessionId  = $data['sessionId'] ?? '';
        $prediction = $data['prediction'] ?? '';
        self::setState($db, $roomId, "juicio_pred:{$sessionId}:{$userId}", $prediction, 300);
        return ['success' => true, 'data' => null];
    }

    private static function juicioVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $sessionId = $data['sessionId'] ?? '';
        $option    = $data['option'] ?? '';
        self::setState($db, $roomId, "juicio_vote:{$sessionId}:{$userId}", $option, 300);
        $count = self::countStatePattern($db, $roomId, "juicio_vote:{$sessionId}:");
        return ['success' => true, 'data' => ['voteCount' => $count]];
    }

    private static function juicioReveal(\PDO $db, string $roomId, string $sessionId): array {
        $raw = self::getState($db, $roomId, "juicio:{$sessionId}");
        if (!$raw) return ['success' => false, 'error' => 'Sesión no encontrada'];
        $session = json_decode($raw, true);

        // Contar votos
        $votes = self::getStatesPattern($db, $roomId, "juicio_vote:{$sessionId}:");
        $counts = ['si' => 0, 'no' => 0];
        foreach ($votes as $v) {
            if ($v === 'si') $counts['si']++;
            else $counts['no']++;
        }
        $verdict = $counts['si'] > $counts['no'] ? 'CULPABLE' : 'INOCENTE';
        return ['success' => true, 'data' => [
            'sessionId' => $sessionId,
            'accusedId' => $session['accusedId'],
            'question'  => $session['question'],
            'verdict'   => $verdict,
            'votes'     => $counts,
        ]];
    }

    // ─── Termómetro ──────────────────────────────────────────────────────────
    private static function termometroStart(\PDO $db, string $roomId): array {
        $questions = [
            '¿Quién tiene más carisma del grupo?', '¿Qué tan atrevido eres en escala 1-10?',
            '¿Cuántas relaciones has tenido?', '¿Qué tan buen amigo eres?',
            '¿Qué tan seguro estás de ti mismo?', '¿Qué probabilidad hay de que te gusten alguien de aquí?',
        ];
        $q  = $questions[array_rand($questions)];
        $id = self::genId();
        self::setState($db, $roomId, "term:{$id}", $q, 600);
        return ['success' => true, 'data' => ['questionId' => $id, 'question' => $q]];
    }

    private static function termometroPosition(\PDO $db, string $roomId, string $userId, array $data): array {
        $questionId = $data['questionId'] ?? '';
        $value      = max(1, min(10, (int)($data['value'] ?? 5)));
        self::setState($db, $roomId, "term_pos:{$questionId}:{$userId}", (string)$value, 300);
        return ['success' => true, 'data' => null];
    }

    private static function termometroReveal(\PDO $db, string $roomId, string $questionId): array {
        $question  = self::getState($db, $roomId, "term:{$questionId}") ?? 'Pregunta';
        $positions = self::getStatesPattern($db, $roomId, "term_pos:{$questionId}:");
        $values    = array_map('intval', $positions);
        $avg       = count($values) ? round(array_sum($values) / count($values), 1) : 0;
        return ['success' => true, 'data' => ['question' => $question, 'average' => $avg, 'positions' => $values]];
    }

    // ─── Todo o Nada ─────────────────────────────────────────────────────────
    private static function todoNadaStart(\PDO $db, string $roomId, string $userId, array $data): array {
        $challenges = [
            'Baila Reggaeton 30 segundos', 'Llama a tu ex en 60 segundos',
            'Haz 20 flexiones ahora', 'Di un secreto frente a todos',
            'Imita al presentador de tu noticiero favorito', 'Canta a cappella',
        ];
        $text    = $challenges[array_rand($challenges)];
        $bet     = max(10, min(100, (int)($data['bet'] ?? 20)));
        $roundId = self::genId();
        self::setState($db, $roomId, "tn:{$roundId}", json_encode([
            'userId' => $userId, 'text' => $text, 'bet' => $bet
        ]), 600);
        return ['success' => true, 'data' => ['roundId' => $roundId, 'challengeText' => $text, 'bet' => $bet]];
    }

    private static function todoNadaVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $roundId   = $data['roundId'] ?? '';
        $completed = (bool)($data['completed'] ?? false);
        self::setState($db, $roomId, "tn_vote:{$roundId}:{$userId}", $completed ? '1' : '0', 300);
        return ['success' => true, 'data' => null];
    }

    private static function todoNadaResolve(\PDO $db, string $roomId, string $userId, array $data): array {
        $roundId = $data['roundId'] ?? '';
        $raw     = self::getState($db, $roomId, "tn:{$roundId}");
        if (!$raw) return ['success' => false, 'error' => 'Reto no encontrado'];
        $round   = json_decode($raw, true);
        $votes   = self::getStatesPattern($db, $roomId, "tn_vote:{$roundId}:");
        $yes     = count(array_filter($votes, fn($v) => $v === '1'));
        $no      = count($votes) - $yes;
        $won     = $yes > $no;
        $payout  = $won ? $round['bet'] : -$round['bet'];
        return ['success' => true, 'data' => ['won' => $won, 'payout' => $payout, 'votes' => ['yes' => $yes, 'no' => $no]]];
    }

    // ─── Battle 1v1 ──────────────────────────────────────────────────────────
    private static function battle1v1Start(\PDO $db, string $roomId, string $userId, array $data): array {
        $categories = ['flirt', 'humor', 'creatividad', 'carisma'];
        $cat     = $categories[array_rand($categories)];
        $battleId = self::genId();
        $prompt  = "¡Batalla de {$cat}! Demuestra tu mejor habilidad.";
        self::setState($db, $roomId, "b1v1:{$battleId}", json_encode([
            'category' => $cat, 'prompt' => $prompt,
            'p1' => $data['player1Id'] ?? '', 'p2' => $data['player2Id'] ?? ''
        ]), 600);
        return ['success' => true, 'data' => ['battleId' => $battleId, 'category' => $cat, 'prompt' => $prompt]];
    }

    private static function battle1v1Vote(\PDO $db, string $roomId, string $userId, array $data): array {
        $battleId = $data['battleId'] ?? '';
        $winnerId = $data['winnerId'] ?? '';
        self::setState($db, $roomId, "b1v1_vote:{$battleId}:{$userId}", $winnerId, 300);
        $votes    = self::getStatesPattern($db, $roomId, "b1v1_vote:{$battleId}:");
        $tally    = array_count_values($votes);
        arsort($tally);
        $winner   = array_key_first($tally);
        return ['success' => true, 'data' => ['votes' => count($votes), 'leadingWinner' => $winner]];
    }

    // ─── Liga ────────────────────────────────────────────────────────────────
    private static function ligaNextRound(\PDO $db, string $roomId, string $userId): array {
        $players = RoomsController::getPlayers($db, $roomId);
        if (count($players) < 2) return ['success' => false, 'error' => 'Faltan jugadores'];
        $idx = array_rand($players, 2);
        $p1  = $players[$idx[0]];
        $p2  = $players[$idx[1]];
        $matchId = self::genId();
        self::setState($db, $roomId, "liga:{$matchId}", json_encode(['p1' => $p1, 'p2' => $p2]), 600);
        return ['success' => true, 'data' => ['matchId' => $matchId, 'player1' => $p1, 'player2' => $p2]];
    }

    private static function ligaVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $matchId  = $data['matchId'] ?? '';
        $winnerId = $data['winnerId'] ?? '';
        self::setState($db, $roomId, "liga_vote:{$matchId}:{$userId}", $winnerId, 300);
        return ['success' => true, 'data' => null];
    }

    private static function ligaResults(\PDO $db, string $roomId): array {
        $players = RoomsController::getPlayers($db, $roomId);
        $scores  = [];
        foreach ($players as $p) {
            $scores[$p['id']] = ['player' => $p, 'wins' => 0, 'losses' => 0];
        }
        return ['success' => true, 'data' => ['standings' => array_values($scores)]];
    }

    // ─── Actores ─────────────────────────────────────────────────────────────
    private static function actoresAssign(\PDO $db, string $roomId, string $userId): array {
        $roles   = ['El coqueto', 'El tímido', 'El gracioso', 'El misterioso',
                    'El bromista', 'El seductor', 'El nerd', 'La reina del drama'];
        $players = RoomsController::getPlayers($db, $roomId);
        shuffle($roles);
        foreach ($players as $i => $p) {
            $role = $roles[$i % count($roles)];
            self::setState($db, $roomId, "actor_role:{$p['id']}", $role, 3600);
        }
        return ['success' => true, 'data' => ['assigned' => true]];
    }

    private static function actoresMyRole(\PDO $db, string $roomId, string $userId): array {
        $role = self::getState($db, $roomId, "actor_role:{$userId}");
        if (!$role) return ['success' => false, 'error' => 'Aún no se han asignado roles'];
        return ['success' => true, 'data' => ['role' => $role]];
    }

    private static function actoresVoteBest(\PDO $db, string $roomId, string $userId, array $data): array {
        $targetId = $data['playerId'] ?? '';
        self::setState($db, $roomId, "actor_vote:{$userId}", $targetId, 1800);
        return ['success' => true, 'data' => null];
    }

    private static function actoresGuessRoles(\PDO $db, string $roomId, string $userId, array $data): array {
        $guesses = $data['guesses'] ?? [];
        self::setState($db, $roomId, "actor_guess:{$userId}", json_encode($guesses), 1800);
        return ['success' => true, 'data' => null];
    }

    private static function actoresReveal(\PDO $db, string $roomId): array {
        $players = RoomsController::getPlayers($db, $roomId);
        $results = [];
        foreach ($players as $p) {
            $role = self::getState($db, $roomId, "actor_role:{$p['id']}") ?? '?';
            $results[] = ['playerId' => $p['id'], 'username' => $p['username'], 'role' => $role];
        }
        return ['success' => true, 'data' => ['assignments' => $results]];
    }

    // ─── Oscuro ──────────────────────────────────────────────────────────────
    private static function oscuroGetChallenge(\PDO $db, string $roomId, string $userId, array $data): array {
        $challenges = [
            'Confiesa algo que nunca le has dicho a nadie del grupo.',
            'Muestra el último mensaje que enviaste y a quién.',
            '¿Tienes sentimientos por alguien aquí? Di quién.',
            'Llama a alguien que no hablas hace tiempo.',
            'Lee el último mensaje que te mandaron sin filtro.',
        ];
        $text = $challenges[array_rand($challenges)];
        $cid  = self::genId();
        return ['success' => true, 'data' => ['challengeId' => $cid, 'text' => $text]];
    }

    private static function oscuroReact(\PDO $db, string $roomId, string $userId, array $data): array {
        $cid      = $data['challengeId'] ?? '';
        $reaction = $data['reaction'] ?? '';
        RoomsController::pushEvent($db, $roomId, 'oscuro:reaction', [
            'challengeId' => $cid, 'userId' => $userId, 'reaction' => $reaction
        ]);
        return ['success' => true, 'data' => null];
    }

    // ─── Cartas ──────────────────────────────────────────────────────────────
    private static function cartasDeal(\PDO $db, string $roomId, string $userId): array {
        $deck = [
            ['id' => '1', 'text' => 'Te doy mi número'],
            ['id' => '2', 'text' => 'Te invito al cine'],
            ['id' => '3', 'text' => 'Eres mi favorito/a'],
            ['id' => '4', 'text' => 'Me gustas'],
            ['id' => '5', 'text' => 'Solo somos amigos'],
        ];
        shuffle($deck);
        $hand = array_slice($deck, 0, 3);
        return ['success' => true, 'data' => ['cards' => $hand]];
    }

    private static function cartasPlay(\PDO $db, string $roomId, string $userId, array $data): array {
        $cardId = $data['cardId'] ?? '';
        self::setState($db, $roomId, "carta_played:{$userId}", $cardId, 600);
        $played = self::countStatePattern($db, $roomId, 'carta_played:');
        return ['success' => true, 'data' => ['played' => $played]];
    }

    private static function cartasVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $cardId = $data['cardId'] ?? '';
        self::setState($db, $roomId, "carta_vote:{$userId}", $cardId, 300);
        return ['success' => true, 'data' => null];
    }

    private static function cartasResolve(\PDO $db, string $roomId): array {
        $votes   = self::getStatesPattern($db, $roomId, 'carta_vote:');
        $tally   = array_count_values($votes);
        arsort($tally);
        $winner  = array_key_first($tally) ?? '';
        $cards   = [
            '1' => 'Te doy mi número', '2' => 'Te invito al cine',
            '3' => 'Eres mi favorito/a', '4' => 'Me gustas', '5' => 'Solo somos amigos',
        ];
        return ['success' => true, 'data' => [
            'winnerCard' => ['id' => $winner, 'text' => $cards[$winner] ?? ''],
        ]];
    }

    // ─── Último en Pie ───────────────────────────────────────────────────────
    private static function ultimoPieStart(\PDO $db, string $roomId, string $userId): array {
        $players = RoomsController::getPlayers($db, $roomId);
        $roundId = self::genId();
        self::setState($db, $roomId, "ulpie:{$roundId}", json_encode(array_column($players, 'id')), 600);
        return ['success' => true, 'data' => ['roundId' => $roundId, 'players' => $players]];
    }

    private static function ultimoPieVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $roundId  = $data['roundId'] ?? '';
        $targetId = $data['targetId'] ?? '';
        self::setState($db, $roomId, "ulpie_vote:{$roundId}:{$userId}", $targetId, 300);
        return ['success' => true, 'data' => null];
    }

    private static function ultimoPieResults(\PDO $db, string $roomId, array $data): array {
        $roundId  = $data['roundId'] ?? '';
        $votes    = self::getStatesPattern($db, $roomId, "ulpie_vote:{$roundId}:");
        $tally    = array_count_values($votes);
        arsort($tally);
        $eliminated = array_key_first($tally) ?? '';
        return ['success' => true, 'data' => ['eliminatedId' => $eliminated, 'votes' => $tally]];
    }

    private static function ultimoPieSalvation(\PDO $db, string $roomId, string $userId, array $data): array {
        $roundId  = $data['roundId'] ?? '';
        $survived = (bool)($data['survived'] ?? false);
        return ['success' => true, 'data' => ['survived' => $survived]];
    }

    // ─── Estado en DB ────────────────────────────────────────────────────────
    public static function setState(\PDO $db, string $roomId, string $key, string $value, int $ttl): void {
        $exp = date('Y-m-d H:i:s', time() + $ttl);
        $db->prepare(
            'INSERT INTO game_state (room_id, state_key, state_value, expires_at)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE state_value = VALUES(state_value), expires_at = VALUES(expires_at)'
        )->execute([$roomId, $key, $value, $exp]);
    }

    public static function getState(\PDO $db, string $roomId, string $key): ?string {
        $stmt = $db->prepare(
            'SELECT state_value FROM game_state
             WHERE room_id = ? AND state_key = ? AND (expires_at IS NULL OR expires_at > NOW())
             LIMIT 1'
        );
        $stmt->execute([$roomId, $key]);
        $val = $stmt->fetchColumn();
        return $val !== false ? $val : null;
    }

    public static function deleteState(\PDO $db, string $roomId, string $key): void {
        $db->prepare('DELETE FROM game_state WHERE room_id = ? AND state_key = ?')
           ->execute([$roomId, $key]);
    }

    private static function getStatesPattern(\PDO $db, string $roomId, string $prefix): array {
        $stmt = $db->prepare(
            'SELECT state_value FROM game_state
             WHERE room_id = ? AND state_key LIKE ? AND (expires_at IS NULL OR expires_at > NOW())'
        );
        $stmt->execute([$roomId, $prefix . '%']);
        return $stmt->fetchAll(\PDO::FETCH_COLUMN);
    }

    private static function countStatePattern(\PDO $db, string $roomId, string $prefix): int {
        $stmt = $db->prepare(
            'SELECT COUNT(*) FROM game_state
             WHERE room_id = ? AND state_key LIKE ? AND (expires_at IS NULL OR expires_at > NOW())'
        );
        $stmt->execute([$roomId, $prefix . '%']);
        return (int)$stmt->fetchColumn();
    }

    private static function getMode(\PDO $db, string $roomId): string {
        $stmt = $db->prepare('SELECT mode FROM rooms WHERE id = ? LIMIT 1');
        $stmt->execute([$roomId]);
        return $stmt->fetchColumn() ?: '';
    }

    private static function genId(): string {
        return bin2hex(random_bytes(8));
    }
}
