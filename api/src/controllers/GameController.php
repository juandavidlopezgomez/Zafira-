<?php
namespace BF\Controllers;

use BF\{Database, Auth, Response, Llamas, Charisma, Challenges, Interest, Badges};

/**
 * Maneja todos los eventos de juego vía POST /api/game/{roomId}/action
 * y el polling de eventos vía GET /api/game/{roomId}/events
 */
class GameController {
    public static function action(string $roomId): void {
        $payload = Auth::requireUser();
        $userId  = $payload['sub'];
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];
        $event   = $body['event'] ?? '';
        $data    = $body['payload'] ?? [];
        $db      = Database::get();

        // Heartbeat
        $db->prepare('UPDATE room_players SET last_seen = NOW() WHERE room_id = ? AND user_id = ?')
           ->execute([$roomId, $userId]);

        $result = match($event) {
            'room:join'           => self::roomJoin($db, $roomId),
            'room:leave'          => self::roomLeave($db, $roomId, $userId),
            'game:ready'          => self::gameReady($db, $roomId, $userId),
            'game:start'          => self::gameStart($db, $roomId, $userId),
            'game:mark_interest'  => self::markInterest($db, $roomId, $userId, $data['targetId'] ?? ''),
            'game:end'            => self::gameEnd($db, $roomId, $userId),

            // Botella
            'bottle:spin'         => self::bottleSpin($db, $roomId, $userId),
            'bottle:dare'         => self::bottleDare($db, $roomId, $userId, $data),

            // Truth or Dare
            'truth_dare:choose'   => self::truthDareChoose($db, $roomId, $userId, $data),
            'truth_dare:complete' => self::truthDareComplete($db, $roomId, $userId, $data),
            'truth_dare:skip'     => self::truthDareSkip($db, $roomId, $userId, $data),
            'truth_dare:vote'     => self::truthDareVote($db, $roomId, $userId, $data),

            // Battle 1v1
            'battle_1v1:start'    => self::battle1v1Start($db, $roomId, $userId, $data),
            'battle_1v1:vote'     => self::battle1v1Vote($db, $roomId, $userId, $data),
            'battle_1v1:resolve'  => self::battle1v1Resolve($db, $roomId, $data),

            // Liga
            'liga:next_round'     => self::ligaNextRound($db, $roomId),
            'liga:vote'           => self::ligaVote($db, $roomId, $userId, $data),
            'liga:results'        => self::ligaResults($db, $roomId),

            // Juicio
            'juicio:start'        => self::juicioStart($db, $roomId, $userId, $data),
            'juicio:predict'      => self::juicioPredict($db, $roomId, $userId, $data),
            'juicio:vote'         => self::juicioVote($db, $roomId, $userId, $data),
            'juicio:reveal'       => self::juicioReveal($db, $roomId, $data),

            // Oscuro (Premium 18+)
            'oscuro:get_challenge'=> self::oscuroGetChallenge($db, $roomId, $userId, $data),
            'oscuro:react'        => self::oscuroReact($db, $roomId, $userId, $data),

            // Cartas
            'cartas:deal'         => self::cartasDeal($db, $roomId, $userId),
            'cartas:play'         => self::cartasPlay($db, $roomId, $userId, $data),
            'cartas:vote'         => self::cartasVote($db, $roomId, $userId, $data),
            'cartas:resolve'      => self::cartasResolve($db, $roomId),

            // Termómetro
            'termometro:start'    => self::termometroStart($db, $roomId),
            'termometro:position' => self::termometroPosition($db, $roomId, $userId, $data),
            'termometro:reveal'   => self::termometroReveal($db, $roomId, $data),

            // Actores
            'actores:assign_roles'=> self::actoresAssign($db, $roomId, $userId),
            'actores:my_role'     => self::actoresMyRole($db, $roomId, $userId),
            'actores:vote_best'   => self::actoresVoteBest($db, $roomId, $userId, $data),
            'actores:guess_roles' => self::actoresGuessRoles($db, $roomId, $userId, $data),
            'actores:reveal'      => self::actoresReveal($db, $roomId),

            // Último en Pie
            'ultimo_pie:start'    => self::ultimoPieStart($db, $roomId, $userId),
            'ultimo_pie:vote'     => self::ultimoPieVote($db, $roomId, $userId, $data),
            'ultimo_pie:results'  => self::ultimoPieResults($db, $roomId, $data),
            'ultimo_pie:salvation'=> self::ultimoPieSalvation($db, $roomId, $userId, $data),

            // Todo o Nada
            'todo_nada:start'     => self::todoNadaStart($db, $roomId, $userId, $data),
            'todo_nada:vote'      => self::todoNadaVote($db, $roomId, $userId, $data),
            'todo_nada:resolve'   => self::todoNadaResolve($db, $roomId, $data),

            default               => ['success' => false, 'error' => "Evento desconocido: {$event}"],
        };

        Response::json($result);
    }

    public static function events(string $roomId): void {
        $payload = Auth::requireUser();
        $userId  = $payload['sub'];
        $since   = (int)($_GET['since'] ?? 0);
        $db      = Database::get();

        $db->prepare('UPDATE room_players SET last_seen = NOW() WHERE room_id = ? AND user_id = ?')
           ->execute([$roomId, $userId]);

        $stmt = $db->prepare(
            'SELECT id, event_type, payload, created_at FROM game_events
             WHERE room_id = ? AND id > ?
               AND (target_user_id IS NULL OR target_user_id = ?)
             ORDER BY id ASC LIMIT 100'
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

    // ════════════════════════════════════════════════════════════════════════
    // ROOM
    // ════════════════════════════════════════════════════════════════════════

    private static function roomJoin(\PDO $db, string $roomId): array {
        $stmt = $db->prepare('SELECT * FROM rooms WHERE id = ? LIMIT 1');
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();
        if (!$room) return self::err('Sala no encontrada');

        return self::ok([
            'roomId'  => $roomId,
            'players' => RoomsController::getPlayers($db, $roomId),
            'mode'    => $room['mode'],
            'status'  => $room['status'],
        ]);
    }

    private static function roomLeave(\PDO $db, string $roomId, string $userId): array {
        $db->prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?')
           ->execute([$roomId, $userId]);
        RoomsController::pushEvent($db, $roomId, 'room:player_left', ['userId' => $userId]);
        return self::ok(null);
    }

    private static function gameReady(\PDO $db, string $roomId, string $userId): array {
        self::setState($db, $roomId, "ready:{$userId}", '1', 600);
        return self::ok(null);
    }

    private static function gameStart(\PDO $db, string $roomId, string $userId): array {
        if (!self::isHost($db, $roomId, $userId)) return self::err('Solo el host puede iniciar');

        // Premiar bono diario al host (1ra partida del día) y carisma por hostear
        Llamas::awardDailyIfNeeded($db, $userId);
        Charisma::award($db, $userId, Charisma::A_HOST_GAME, Charisma::R_HOST_GAME);

        $mode = self::getMode($db, $roomId);
        $db->prepare('UPDATE rooms SET status = ?, started_at = NOW() WHERE id = ?')
           ->execute(['active', $roomId]);
        RoomsController::pushEvent($db, $roomId, 'game:started', ['mode' => $mode]);
        return self::ok(['mode' => $mode]);
    }

    private static function markInterest(\PDO $db, string $roomId, string $userId, string $targetId): array {
        if (!$targetId)              return self::err('targetId requerido');
        if ($targetId === $userId)   return self::err('No puedes señalarte a ti mismo');
        Interest::signal($db, $roomId, $userId, $targetId);
        return self::ok(['signaled' => true]); // NUNCA broadcast (regla #4)
    }

    private static function gameEnd(\PDO $db, string $roomId, string $userId): array {
        if (!self::isHost($db, $roomId, $userId)) return self::err('Solo el host puede terminar');

        // Premiar carisma + bono diario a todos los jugadores que estuvieron presentes
        $players = RoomsController::getPlayers($db, $roomId);
        foreach ($players as $p) {
            Charisma::award($db, $p['id'], Charisma::A_GAME_COMPLETED, Charisma::R_GAME_COMPLETED);
            Llamas::awardDailyIfNeeded($db, $p['id']);
        }

        // Reveal-only matches (regla #4)
        $matches = Interest::revealMatches($db, $roomId);

        $db->prepare("UPDATE rooms SET status = 'finished', ended_at = NOW() WHERE id = ?")
           ->execute([$roomId]);
        RoomsController::pushEvent($db, $roomId, 'room:ended', ['totalMatches' => count($matches)]);

        return self::ok(['totalMatches' => count($matches)]);
    }

    // ════════════════════════════════════════════════════════════════════════
    // BOTELLA
    // ════════════════════════════════════════════════════════════════════════

    private static function bottleSpin(\PDO $db, string $roomId, string $userId): array {
        $players = RoomsController::getPlayers($db, $roomId);
        if (count($players) < 2) return self::err('Se necesitan al menos 2 jugadores');

        $others  = array_values(array_filter($players, fn($p) => $p['id'] !== $userId));
        $target  = $others[array_rand($others)];
        $degrees = random_int(720, 1440);

        $payload = [
            'spinnerId'      => $userId,
            'targetId'       => $target['id'],
            'targetUsername' => $target['username'],
            'degrees'        => $degrees,
        ];
        RoomsController::pushEvent($db, $roomId, 'bottle:result', $payload);
        return self::ok($payload);
    }

    private static function bottleDare(\PDO $db, string $roomId, string $userId, array $data): array {
        $challenge = Challenges::getChallenge($db, Challenges::TYPE_DARE, 2, ['flirteo'], $userId);
        Charisma::awardChallengeTaken($db, $userId);
        return self::ok($challenge);
    }

    // ════════════════════════════════════════════════════════════════════════
    // TRUTH OR DARE — usa pool real de retos
    // ════════════════════════════════════════════════════════════════════════

    private static function truthDareChoose(\PDO $db, string $roomId, string $userId, array $data): array {
        $choice    = in_array($data['choice'] ?? '', ['truth', 'dare'], true) ? $data['choice'] : 'truth';
        $intensity = max(1, min(5, (int)($data['intensity'] ?? 2)));

        $challenge = Challenges::getChallenge($db, $choice, $intensity, [], $userId);
        if (!$challenge) return self::err('No hay retos disponibles');

        $roundId = self::genId();
        self::setState($db, $roomId, "td_round:{$roundId}", json_encode([
            'userId'      => $userId,
            'choice'      => $choice,
            'challengeId' => $challenge['id'],
            'text'        => $challenge['text'],
        ]), 900);

        Charisma::awardChallengeTaken($db, $userId);

        return self::ok([
            'roundId'   => $roundId,
            'challenge' => $challenge,
        ]);
    }

    private static function truthDareComplete(\PDO $db, string $roomId, string $userId, array $data): array {
        $roundId = $data['roundId'] ?? '';
        $raw = self::getState($db, $roomId, "td_round:{$roundId}");
        if (!$raw) return self::err('Ronda no encontrada');
        $round = json_decode($raw, true);
        if ($round['userId'] !== $userId) return self::err('No es tu turno');

        // Premiar al jugador que completó el reto
        Llamas::awardChallengeCompleted($db, $userId, $roomId);
        Charisma::awardGameCompleted($db, $userId);

        RoomsController::pushEvent($db, $roomId, 'truth_dare:completed', [
            'roundId' => $roundId,
            'userId'  => $userId,
        ]);
        return self::ok(['rewarded' => true]);
    }

    private static function truthDareSkip(\PDO $db, string $roomId, string $userId, array $data): array {
        $roundId = $data['roundId'] ?? '';
        // El plan permite max 1 skip por partida — guardamos contador
        $skipKey = "td_skips:{$userId}";
        $skips = (int)(self::getState($db, $roomId, $skipKey) ?? '0');
        if ($skips >= 1) return self::err('Ya usaste tu skip de esta partida');

        self::setState($db, $roomId, $skipKey, (string)($skips + 1), 7200);
        self::deleteState($db, $roomId, "td_round:{$roundId}");
        return self::ok(['skipsUsed' => $skips + 1]);
    }

    private static function truthDareVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $roundId = $data['roundId'] ?? '';
        $vote    = ($data['vote'] ?? '') === 'completed' ? 'completed' : 'failed';
        self::setState($db, $roomId, "td_vote:{$roundId}:{$userId}", $vote, 600);
        $count = self::countStatePattern($db, $roomId, "td_vote:{$roundId}:");
        return self::ok(['voteCount' => $count]);
    }

    // ════════════════════════════════════════════════════════════════════════
    // BATTLE 1v1 — 3 rondas, ganador se queda con +20 carisma + 50 LLAMAS
    // ════════════════════════════════════════════════════════════════════════

    private static function battle1v1Start(\PDO $db, string $roomId, string $userId, array $data): array {
        $p1 = $data['player1Id'] ?? '';
        $p2 = $data['player2Id'] ?? '';
        if (!$p1 || !$p2 || $p1 === $p2) return self::err('Necesitas 2 jugadores distintos');

        $challenge = Challenges::getChallenge($db, Challenges::TYPE_BATTLE, 3, ['1v1'], $userId);
        $battleId  = self::genId();

        self::setState($db, $roomId, "b1v1:{$battleId}", json_encode([
            'p1' => $p1, 'p2' => $p2,
            'question' => $challenge['text'] ?? '¿Quién es más atrevido?',
            'rounds' => 0,
        ]), 1200);

        return self::ok([
            'battleId' => $battleId,
            'player1'  => $p1,
            'player2'  => $p2,
            'question' => $challenge['text'] ?? '',
        ]);
    }

    private static function battle1v1Vote(\PDO $db, string $roomId, string $userId, array $data): array {
        $battleId = $data['battleId'] ?? '';
        $winner   = $data['winnerId'] ?? '';
        self::setState($db, $roomId, "b1v1_vote:{$battleId}:{$userId}", $winner, 600);
        return self::ok(null);
    }

    private static function battle1v1Resolve(\PDO $db, string $roomId, array $data): array {
        $battleId = $data['battleId'] ?? '';
        $raw = self::getState($db, $roomId, "b1v1:{$battleId}");
        if (!$raw) return self::err('Batalla no encontrada');
        $battle = json_decode($raw, true);

        $votes = self::getStatesPattern($db, $roomId, "b1v1_vote:{$battleId}:");
        $tally = array_count_values($votes);
        arsort($tally);
        $winnerId = array_key_first($tally) ?? '';

        if ($winnerId) {
            Llamas::credit($db, $winnerId, 50, 'battle_1v1_win', null, $roomId);
            Charisma::award($db, $winnerId, Charisma::A_VOTED_BEST, Charisma::R_VOTED_BEST);
        }

        return self::ok([
            'winnerId' => $winnerId,
            'tally'    => $tally,
            'question' => $battle['question'] ?? '',
        ]);
    }

    // ════════════════════════════════════════════════════════════════════════
    // LIGA — torneo round-robin con tabla de posiciones
    // ════════════════════════════════════════════════════════════════════════

    private static function ligaNextRound(\PDO $db, string $roomId): array {
        $players = RoomsController::getPlayers($db, $roomId);
        if (count($players) < 2) return self::err('Faltan jugadores');

        $idx = array_rand($players, 2);
        $p1  = $players[$idx[0]];
        $p2  = $players[$idx[1]];

        $challenge = Challenges::getChallenge($db, Challenges::TYPE_BATTLE, 2);
        $matchId   = self::genId();
        self::setState($db, $roomId, "liga:{$matchId}", json_encode([
            'p1' => $p1, 'p2' => $p2, 'question' => $challenge['text'] ?? '',
        ]), 600);

        return self::ok([
            'matchId'  => $matchId,
            'player1'  => $p1,
            'player2'  => $p2,
            'question' => $challenge['text'] ?? '',
        ]);
    }

    private static function ligaVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $matchId = $data['matchId'] ?? '';
        $winner  = $data['winnerId'] ?? '';
        self::setState($db, $roomId, "liga_vote:{$matchId}:{$userId}", $winner, 600);

        // Sumar punto al ganador en tabla
        $scoresKey = 'liga_scores';
        $rawScores = self::getState($db, $roomId, $scoresKey) ?? '{}';
        $scores = json_decode($rawScores, true) ?: [];
        $scores[$winner] = ($scores[$winner] ?? 0) + 1;
        self::setState($db, $roomId, $scoresKey, json_encode($scores), 7200);

        return self::ok(['scores' => $scores]);
    }

    private static function ligaResults(\PDO $db, string $roomId): array {
        $players = RoomsController::getPlayers($db, $roomId);
        $scores  = json_decode(self::getState($db, $roomId, 'liga_scores') ?? '{}', true);

        $standings = [];
        foreach ($players as $p) {
            $standings[] = ['player' => $p, 'wins' => $scores[$p['id']] ?? 0];
        }
        usort($standings, fn($a, $b) => $b['wins'] <=> $a['wins']);

        // Premio al líder
        if (!empty($standings) && $standings[0]['wins'] > 0) {
            $leader = $standings[0]['player']['id'];
            Llamas::credit($db, $leader, 75, 'liga_leader', null, $roomId);
            Charisma::award($db, $leader, Charisma::A_VOTED_BEST, Charisma::R_VOTED_BEST);
        }

        return self::ok(['standings' => $standings]);
    }

    // ════════════════════════════════════════════════════════════════════════
    // EL JUICIO
    // ════════════════════════════════════════════════════════════════════════

    private static function juicioStart(\PDO $db, string $roomId, string $userId, array $data): array {
        $accusedId = $data['accusedId'] ?? '';
        if (!$accusedId) return self::err('accusedId requerido');

        $challenge = Challenges::getChallenge($db, Challenges::TYPE_TRUTH, 3);
        $sessionId = self::genId();
        self::setState($db, $roomId, "juicio:{$sessionId}", json_encode([
            'accusedId' => $accusedId,
            'question'  => $challenge['text'] ?? '¿Es culpable?',
        ]), 900);

        return self::ok([
            'sessionId' => $sessionId,
            'accusedId' => $accusedId,
            'question'  => $challenge['text'] ?? '',
        ]);
    }

    private static function juicioPredict(\PDO $db, string $roomId, string $userId, array $data): array {
        $sessionId  = $data['sessionId'] ?? '';
        $prediction = $data['prediction'] ?? '';
        self::setState($db, $roomId, "juicio_pred:{$sessionId}:{$userId}", $prediction, 600);
        return self::ok(null);
    }

    private static function juicioVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $sessionId = $data['sessionId'] ?? '';
        $option    = ($data['option'] ?? '') === 'si' ? 'si' : 'no';
        self::setState($db, $roomId, "juicio_vote:{$sessionId}:{$userId}", $option, 600);
        $count = self::countStatePattern($db, $roomId, "juicio_vote:{$sessionId}:");
        return self::ok(['voteCount' => $count]);
    }

    private static function juicioReveal(\PDO $db, string $roomId, array $data): array {
        $sessionId = $data['sessionId'] ?? '';
        $raw = self::getState($db, $roomId, "juicio:{$sessionId}");
        if (!$raw) return self::err('Sesión no encontrada');
        $session = json_decode($raw, true);

        $votes = self::getStatesPattern($db, $roomId, "juicio_vote:{$sessionId}:");
        $counts = ['si' => 0, 'no' => 0];
        foreach ($votes as $v) $counts[$v] = ($counts[$v] ?? 0) + 1;
        $verdict = $counts['si'] > $counts['no'] ? 'CULPABLE' : 'INOCENTE';

        // Premiar al acusado si su predicción coincide con el verdicto
        $accusedId  = $session['accusedId'];
        $prediction = self::getState($db, $roomId, "juicio_pred:{$sessionId}:{$accusedId}");
        if ($prediction === $verdict) {
            Llamas::credit($db, $accusedId, 30, 'juicio_predicted', null, $roomId);
            Charisma::award($db, $accusedId, 15, 'juicio_predicted');
        }

        return self::ok([
            'sessionId'  => $sessionId,
            'accusedId'  => $accusedId,
            'question'   => $session['question'],
            'verdict'    => $verdict,
            'votes'      => $counts,
            'predicted'  => $prediction === $verdict,
        ]);
    }

    // ════════════════════════════════════════════════════════════════════════
    // OSCURO — Premium + 18+ obligatorio
    // ════════════════════════════════════════════════════════════════════════

    private static function oscuroGetChallenge(\PDO $db, string $roomId, string $userId, array $data): array {
        // Verificar Premium + age_verified
        $stmt = $db->prepare('SELECT is_premium, age_verified FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $u = $stmt->fetch();
        if (!$u || !(bool)$u['is_premium']) return self::err('Modo Oscuro requiere Premium');
        if (!(bool)$u['age_verified'])      return self::err('Verificación de edad (18+) requerida');

        $intensity = max(4, min(5, (int)($data['intensity'] ?? 4)));
        $challenge = Challenges::getChallenge($db, Challenges::TYPE_DARK, $intensity, [], $userId);
        if (!$challenge) return self::err('No hay retos oscuros disponibles. Contacta admin.');

        Badges::grant($db, $userId, Badges::DARK_UNLOCKED);
        Charisma::awardChallengeTaken($db, $userId);

        return self::ok($challenge);
    }

    private static function oscuroReact(\PDO $db, string $roomId, string $userId, array $data): array {
        RoomsController::pushEvent($db, $roomId, 'oscuro:reaction', [
            'challengeId' => $data['challengeId'] ?? '',
            'userId'      => $userId,
            'reaction'    => $data['reaction'] ?? '',
        ]);
        return self::ok(null);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CARTAS — cada uno recibe 3, juega 1, grupo vota verdad/mentira
    // ════════════════════════════════════════════════════════════════════════

    private static function cartasDeal(\PDO $db, string $roomId, string $userId): array {
        $deck = [
            ['id' => 'c1', 'text' => 'Mentí cuando dije que no me importaba'],
            ['id' => 'c2', 'text' => 'Tengo un crush secreto en este cuarto'],
            ['id' => 'c3', 'text' => 'Una vez fingí estar enfermo para no asistir'],
            ['id' => 'c4', 'text' => 'Me he quedado dormido en clase más de 5 veces'],
            ['id' => 'c5', 'text' => 'He stalkeado a alguien en redes hoy'],
            ['id' => 'c6', 'text' => 'Tengo un talento oculto que nadie conoce'],
            ['id' => 'c7', 'text' => 'Ya he besado a alguien aquí presente'],
            ['id' => 'c8', 'text' => 'Vine porque alguien específico está aquí'],
        ];
        shuffle($deck);
        $hand = array_slice($deck, 0, 3);
        self::setState($db, $roomId, "carta_hand:{$userId}", json_encode($hand), 3600);
        return self::ok(['cards' => $hand]);
    }

    private static function cartasPlay(\PDO $db, string $roomId, string $userId, array $data): array {
        $cardId = $data['cardId'] ?? '';
        $rawHand = self::getState($db, $roomId, "carta_hand:{$userId}");
        $hand    = $rawHand ? json_decode($rawHand, true) : [];
        $card    = current(array_filter($hand, fn($c) => $c['id'] === $cardId));
        if (!$card) return self::err('Carta no está en tu mano');

        self::setState($db, $roomId, "carta_played:{$userId}", json_encode($card), 3600);
        RoomsController::pushEvent($db, $roomId, 'cartas:played', [
            'userId'   => $userId,
            'cardId'   => $cardId,
            'cardText' => $card['text'],
        ]);
        return self::ok(['played' => $card]);
    }

    private static function cartasVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $playerId = $data['playerId'] ?? '';
        $verdict  = ($data['verdict'] ?? '') === 'true' ? 'true' : 'false';
        self::setState($db, $roomId, "carta_v:{$playerId}:{$userId}", $verdict, 600);
        return self::ok(null);
    }

    private static function cartasResolve(\PDO $db, string $roomId): array {
        $players = RoomsController::getPlayers($db, $roomId);
        $results = [];
        foreach ($players as $p) {
            $rawCard = self::getState($db, $roomId, "carta_played:{$p['id']}");
            if (!$rawCard) continue;
            $card  = json_decode($rawCard, true);
            $votes = self::getStatesPattern($db, $roomId, "carta_v:{$p['id']}:");
            $true  = count(array_filter($votes, fn($v) => $v === 'true'));
            $false = count($votes) - $true;
            $results[] = [
                'player'    => $p,
                'card'      => $card,
                'voteTrue'  => $true,
                'voteFalse' => $false,
            ];
        }
        return self::ok(['results' => $results]);
    }

    // ════════════════════════════════════════════════════════════════════════
    // TERMÓMETRO — escala 1-10
    // ════════════════════════════════════════════════════════════════════════

    private static function termometroStart(\PDO $db, string $roomId): array {
        $challenge = Challenges::getChallenge($db, Challenges::TYPE_TRUTH, 2);
        $id        = self::genId();
        $question  = $challenge['text'] ?? '¿Qué tan atrevido te consideras?';
        self::setState($db, $roomId, "term:{$id}", $question, 900);
        RoomsController::pushEvent($db, $roomId, 'termometro:question', [
            'questionId' => $id, 'question' => $question,
        ]);
        return self::ok(['questionId' => $id, 'question' => $question]);
    }

    private static function termometroPosition(\PDO $db, string $roomId, string $userId, array $data): array {
        $qid   = $data['questionId'] ?? '';
        $value = max(1, min(10, (int)($data['value'] ?? 5)));
        self::setState($db, $roomId, "term_pos:{$qid}:{$userId}", (string)$value, 600);
        return self::ok(null);
    }

    private static function termometroReveal(\PDO $db, string $roomId, array $data): array {
        $qid       = $data['questionId'] ?? '';
        $question  = self::getState($db, $roomId, "term:{$qid}") ?? '';
        $positions = self::getStatesPattern($db, $roomId, "term_pos:{$qid}:");
        $values    = array_map('intval', $positions);
        $avg       = $values ? round(array_sum($values) / count($values), 1) : 0;
        $max       = $values ? max($values) : 0;
        $min       = $values ? min($values) : 0;

        return self::ok([
            'question'  => $question,
            'average'   => $avg,
            'max'       => $max,
            'min'       => $min,
            'count'     => count($values),
            'positions' => $values,
        ]);
    }

    // ════════════════════════════════════════════════════════════════════════
    // ACTORES — roles secretos + adivinanza
    // ════════════════════════════════════════════════════════════════════════

    private static function actoresAssign(\PDO $db, string $roomId, string $userId): array {
        if (!self::isHost($db, $roomId, $userId)) return self::err('Solo el host asigna roles');

        $roles = ['El coqueto', 'El tímido', 'El gracioso', 'El misterioso',
                  'El bromista', 'El seductor', 'El nerd', 'La reina del drama',
                  'El sabio', 'El aventurero'];
        $players = RoomsController::getPlayers($db, $roomId);
        shuffle($roles);
        foreach ($players as $i => $p) {
            $role = $roles[$i % count($roles)];
            self::setState($db, $roomId, "actor_role:{$p['id']}", $role, 7200);
            // Evento PRIVADO con el rol asignado (target_user_id)
            RoomsController::pushEvent($db, $roomId, 'actores:role_assigned', [
                'role' => $role,
            ], $p['id']);
        }
        return self::ok(['assigned' => count($players)]);
    }

    private static function actoresMyRole(\PDO $db, string $roomId, string $userId): array {
        $role = self::getState($db, $roomId, "actor_role:{$userId}");
        if (!$role) return self::err('Aún no se han asignado roles');
        return self::ok(['role' => $role]);
    }

    private static function actoresVoteBest(\PDO $db, string $roomId, string $userId, array $data): array {
        $target = $data['playerId'] ?? '';
        self::setState($db, $roomId, "actor_vote:{$userId}", $target, 1800);
        return self::ok(null);
    }

    private static function actoresGuessRoles(\PDO $db, string $roomId, string $userId, array $data): array {
        $guesses = $data['guesses'] ?? [];
        self::setState($db, $roomId, "actor_guess:{$userId}", json_encode($guesses), 1800);
        return self::ok(null);
    }

    private static function actoresReveal(\PDO $db, string $roomId): array {
        $players = RoomsController::getPlayers($db, $roomId);
        $assignments = [];
        $roles = [];
        foreach ($players as $p) {
            $role = self::getState($db, $roomId, "actor_role:{$p['id']}") ?? '?';
            $assignments[] = ['playerId' => $p['id'], 'username' => $p['username'], 'role' => $role];
            $roles[$p['id']] = $role;
        }

        // Mejor actor: contar votos
        $votes = self::getStatesPattern($db, $roomId, 'actor_vote:');
        $tally = array_count_values($votes);
        arsort($tally);
        $bestActor = array_key_first($tally);

        if ($bestActor) {
            Llamas::credit($db, $bestActor, 40, 'actores_best', null, $roomId);
            Charisma::award($db, $bestActor, Charisma::A_VOTED_BEST, Charisma::R_VOTED_BEST);
        }

        // Premiar a quien adivinó más roles
        $bestGuesser = null;
        $bestHits    = 0;
        foreach ($players as $p) {
            $rawGuesses = self::getState($db, $roomId, "actor_guess:{$p['id']}");
            if (!$rawGuesses) continue;
            $guesses = json_decode($rawGuesses, true) ?: [];
            $hits = 0;
            foreach ($guesses as $targetId => $guessedRole) {
                if (($roles[$targetId] ?? '') === $guessedRole) $hits++;
            }
            if ($hits > $bestHits) {
                $bestHits = $hits;
                $bestGuesser = $p['id'];
            }
        }
        if ($bestGuesser && $bestHits > 0) {
            Llamas::credit($db, $bestGuesser, 30, 'actores_guesser', null, $roomId);
        }

        return self::ok([
            'assignments' => $assignments,
            'bestActor'   => $bestActor,
            'bestGuesser' => $bestGuesser,
            'bestHits'    => $bestHits,
        ]);
    }

    // ════════════════════════════════════════════════════════════════════════
    // ÚLTIMO EN PIE — eliminación progresiva
    // ════════════════════════════════════════════════════════════════════════

    private static function ultimoPieStart(\PDO $db, string $roomId, string $userId): array {
        $players = RoomsController::getPlayers($db, $roomId);
        if (count($players) < 3) return self::err('Mínimo 3 jugadores');
        $alive = array_column($players, 'id');
        self::setState($db, $roomId, 'ulpie_alive', json_encode($alive), 7200);

        $roundId = self::genId();
        self::setState($db, $roomId, "ulpie_round:{$roundId}", json_encode($alive), 600);
        return self::ok(['roundId' => $roundId, 'alive' => $players]);
    }

    private static function ultimoPieVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $roundId = $data['roundId'] ?? '';
        $target  = $data['targetId'] ?? '';
        self::setState($db, $roomId, "ulpie_vote:{$roundId}:{$userId}", $target, 600);
        return self::ok(null);
    }

    private static function ultimoPieResults(\PDO $db, string $roomId, array $data): array {
        $roundId = $data['roundId'] ?? '';
        $votes = self::getStatesPattern($db, $roomId, "ulpie_vote:{$roundId}:");
        $tally = array_count_values($votes);
        arsort($tally);
        $eliminated = array_key_first($tally) ?? '';

        // Actualizar lista de vivos
        $alive = json_decode(self::getState($db, $roomId, 'ulpie_alive') ?? '[]', true);
        $alive = array_values(array_filter($alive, fn($id) => $id !== $eliminated));
        self::setState($db, $roomId, 'ulpie_alive', json_encode($alive), 7200);

        // Si queda solo 1, ganador
        $winner = count($alive) === 1 ? $alive[0] : null;
        if ($winner) {
            Llamas::credit($db, $winner, 150, 'ultimo_pie_winner', null, $roomId);
            Charisma::award($db, $winner, 30, 'ultimo_pie_winner');
        }

        return self::ok([
            'eliminatedId' => $eliminated,
            'aliveIds'     => $alive,
            'winnerId'     => $winner,
            'votes'        => $tally,
        ]);
    }

    private static function ultimoPieSalvation(\PDO $db, string $roomId, string $userId, array $data): array {
        $survived = (bool)($data['survived'] ?? false);
        if ($survived) {
            // Re-añadir a la lista de vivos
            $alive = json_decode(self::getState($db, $roomId, 'ulpie_alive') ?? '[]', true);
            if (!in_array($userId, $alive, true)) $alive[] = $userId;
            self::setState($db, $roomId, 'ulpie_alive', json_encode($alive), 7200);
            Charisma::award($db, $userId, 15, 'ultimo_pie_salvation');
        }
        return self::ok(['survived' => $survived]);
    }

    // ════════════════════════════════════════════════════════════════════════
    // TODO O NADA — apuesta REAL de LLAMAS con débito y payout 2x
    // ════════════════════════════════════════════════════════════════════════

    private static function todoNadaStart(\PDO $db, string $roomId, string $userId, array $data): array {
        $bet = max(10, min(100, (int)($data['bet'] ?? 20)));

        // Cobrar la apuesta INMEDIATAMENTE (regla #2: ledger primero)
        try {
            Llamas::todoNadaBet($db, $userId, $bet, $roomId);
        } catch (\RuntimeException $e) {
            return self::err($e->getMessage());
        }

        $challenge = Challenges::getChallenge($db, Challenges::TYPE_DARE, 4, ['todo_nada'], $userId);
        $roundId   = self::genId();
        self::setState($db, $roomId, "tn:{$roundId}", json_encode([
            'userId' => $userId,
            'bet'    => $bet,
            'text'   => $challenge['text'] ?? 'Reto extremo',
            'resolved' => false,
        ]), 1800);

        return self::ok([
            'roundId'   => $roundId,
            'bet'       => $bet,
            'challenge' => $challenge,
            'newBalance'=> Llamas::balance($db, $userId),
        ]);
    }

    private static function todoNadaVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $roundId   = $data['roundId'] ?? '';
        $completed = (bool)($data['completed'] ?? false);
        self::setState($db, $roomId, "tn_vote:{$roundId}:{$userId}", $completed ? '1' : '0', 600);
        return self::ok(null);
    }

    private static function todoNadaResolve(\PDO $db, string $roomId, array $data): array {
        $roundId = $data['roundId'] ?? '';
        $raw = self::getState($db, $roomId, "tn:{$roundId}");
        if (!$raw) return self::err('Reto no encontrado');
        $round = json_decode($raw, true);
        if (!empty($round['resolved'])) return self::err('Ya resuelto');

        $votes = self::getStatesPattern($db, $roomId, "tn_vote:{$roundId}:");
        $yes   = count(array_filter($votes, fn($v) => $v === '1'));
        $no    = count($votes) - $yes;
        $won   = $yes > $no;

        if ($won) {
            // Payout: 2x la apuesta (devuelve apuesta + ganancia igual)
            Llamas::todoNadaWin($db, $round['userId'], (int)$round['bet'], $roomId);
        }

        // Marcar resuelto
        $round['resolved'] = true;
        self::setState($db, $roomId, "tn:{$roundId}", json_encode($round), 1800);

        return self::ok([
            'won'        => $won,
            'votes'      => ['yes' => $yes, 'no' => $no],
            'payout'     => $won ? $round['bet'] * 2 : 0,
            'newBalance' => Llamas::balance($db, $round['userId']),
        ]);
    }

    // ════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ════════════════════════════════════════════════════════════════════════

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
        return (string)($stmt->fetchColumn() ?: '');
    }

    private static function isHost(\PDO $db, string $roomId, string $userId): bool {
        $stmt = $db->prepare('SELECT 1 FROM rooms WHERE id = ? AND host_id = ? LIMIT 1');
        $stmt->execute([$roomId, $userId]);
        return (bool)$stmt->fetch();
    }

    private static function genId(): string {
        return bin2hex(random_bytes(8));
    }

    private static function ok(mixed $data): array {
        return ['success' => true, 'data' => $data];
    }

    private static function err(string $msg): array {
        return ['success' => false, 'error' => $msg];
    }
}
