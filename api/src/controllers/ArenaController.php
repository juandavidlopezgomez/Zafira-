<?php
namespace BF\Controllers;

use BF\{Database, Auth, Response, Arena, Llamas, Charisma, Badges, Ai, Challenges};

class ArenaController {
    // POST /api/arena/:roomId/action — dispatcher genérico
    public static function action(string $roomId): void {
        $payload = Auth::requireUser();
        $userId  = $payload['sub'];
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];
        $event   = $body['event'] ?? '';
        $data    = $body['payload'] ?? [];
        $db      = Database::get();

        // Validar mínimo 5 (regla #7) - aplicado a casi todas las features
        if (!Arena::ensureMinParticipants($db, $roomId)) {
            Response::error('Arena requiere mínimo ' . Arena::MIN_PARTICIPANTS . ' participantes', 400);
        }

        $result = match ($event) {
            // Genéricos
            'arena:start_feature' => self::startFeatureAction($db, $roomId, $userId, $data),
            'arena:end_feature'   => self::endFeature($db, $userId, $data),
            'arena:state'         => self::state($db, $roomId),

            // Silla Caliente (feature 2)
            'silla:question'      => self::sillaQuestion($db, $roomId, $userId, $data),
            'silla:answer'        => self::sillaAnswer($db, $roomId, $userId, $data),
            'silla:rate'          => self::sillaRate($db, $roomId, $userId, $data),
            'silla:end'           => self::sillaEnd($db, $roomId, $data),

            // Sobre Rojo (feature 3) — Premium
            'sobre:send'          => self::sobreSend($db, $roomId, $userId, $data),
            'sobre:open'          => self::sobreOpen($db, $roomId, $userId, $data),
            'sobre:guess'         => self::sobreGuess($db, $roomId, $userId, $data),
            'sobre:reveal'        => self::sobreReveal($db, $roomId, $data),

            // Quién en tu Curso (feature 5)
            'quien:start'         => self::quienStart($db, $roomId, $userId),
            'quien:vote'          => self::quienVote($db, $roomId, $userId, $data),
            'quien:results'       => self::quienResults($db, $roomId, $data),

            // Termómetro Colegio (feature 6)
            'term_arena:start'    => self::termArenaStart($db, $roomId, $userId),
            'term_arena:vote'     => self::termArenaVote($db, $roomId, $userId, $data),
            'term_arena:results'  => self::termArenaResults($db, $roomId, $data),

            // Momento Épico (feature 7)
            'epic:nominate'       => self::epicNominate($db, $roomId, $userId, $data),
            'epic:vote'           => self::epicVote($db, $roomId, $userId, $data),
            'epic:hall_of_fame'   => self::epicHallOfFame($db, $roomId),

            // Shipper (feature 9)
            'ship:propose'        => self::shipPropose($db, $roomId, $userId, $data),
            'ship:vote'           => self::shipVote($db, $roomId, $userId, $data),
            'ship:winner'         => self::shipWinner($db, $roomId, $userId),

            default               => self::err("Evento Arena desconocido: {$event}"),
        };

        Response::json($result);
    }

    // ─── Genéricos ──────────────────────────────────────────────────────────

    private static function startFeatureAction(\PDO $db, string $roomId, string $userId, array $data): array {
        $feature = $data['feature'] ?? '';
        $valid = [Arena::F_ESTADIO, Arena::F_SILLA, Arena::F_SOBRE, Arena::F_QUIEN,
                  Arena::F_TERMOMETRO, Arena::F_EPIC, Arena::F_RULETA, Arena::F_SHIPPER];
        if (!in_array($feature, $valid, true)) return self::err('Feature inválida');

        // Premium gating
        if (Arena::isPremiumFeature($feature) && !Arena::userIsPremium($db, $userId)) {
            return self::err("La feature {$feature} requiere Premium", 403);
        }

        $stadiumId = Arena::startStadium($db, $roomId, $userId, $feature);
        Arena::addEvent($db, $stadiumId, 'feature_started', $userId, ['feature' => $feature]);

        // Push global a la sala
        RoomsController::pushEvent($db, $roomId, 'arena:feature_started', [
            'stadiumId' => $stadiumId,
            'feature'   => $feature,
        ]);

        return self::ok(['stadiumId' => $stadiumId, 'feature' => $feature]);
    }

    private static function endFeature(\PDO $db, string $userId, array $data): array {
        $stadiumId = $data['stadiumId'] ?? '';
        if (!$stadiumId) return self::err('stadiumId requerido');
        Arena::endStadium($db, $stadiumId);
        return self::ok(['ended' => $stadiumId]);
    }

    private static function state(\PDO $db, string $roomId): array {
        $stmt = $db->prepare(
            "SELECT id, feature, status, started_at, ended_at FROM arena_stadiums
             WHERE room_id = ? ORDER BY started_at DESC LIMIT 10"
        );
        $stmt->execute([$roomId]);
        return self::ok(['stadiums' => $stmt->fetchAll()]);
    }

    // ─── Silla Caliente (feature 2) ─────────────────────────────────────────

    private static function sillaQuestion(\PDO $db, string $roomId, string $userId, array $data): array {
        $stadiumId = $data['stadiumId'] ?? Arena::getActiveStadium($db, $roomId, Arena::F_SILLA);
        if (!$stadiumId) return self::err('Silla Caliente no activa');
        $question  = trim($data['question'] ?? '');
        $targetId  = $data['targetId'] ?? '';
        if (!$question || mb_strlen($question) > 200) return self::err('Pregunta inválida');

        // Moderación
        $mod = Ai::moderate($question);
        if ($mod && !empty($mod['flagged'])) return self::err('Pregunta no permitida');

        $eventId = Arena::addEvent($db, $stadiumId, 'silla_question', $userId, [
            'question' => $question,
            'targetId' => $targetId,
        ]);
        RoomsController::pushEvent($db, $roomId, 'silla:new_question', [
            'eventId'  => $eventId,
            'question' => $question,
            'fromId'   => $userId,
            'targetId' => $targetId,
        ], $targetId);
        return self::ok(['eventId' => $eventId]);
    }

    private static function sillaAnswer(\PDO $db, string $roomId, string $userId, array $data): array {
        $stadiumId = Arena::getActiveStadium($db, $roomId, Arena::F_SILLA);
        if (!$stadiumId) return self::err('Silla Caliente no activa');
        $eventId = $data['eventId'] ?? '';
        $answer  = trim($data['answer'] ?? '');
        $skipped = (bool)($data['skipped'] ?? false);

        Arena::addEvent($db, $stadiumId, 'silla_answer', $userId, [
            'parentEventId' => $eventId,
            'answer'        => $skipped ? null : $answer,
            'skipped'       => $skipped,
        ]);
        return self::ok(['answered' => true, 'skipped' => $skipped]);
    }

    private static function sillaRate(\PDO $db, string $roomId, string $userId, array $data): array {
        $stadiumId = Arena::getActiveStadium($db, $roomId, Arena::F_SILLA);
        if (!$stadiumId) return self::err('Silla Caliente no activa');
        $score = max(1, min(5, (int)($data['score'] ?? 3)));
        $targetId = $data['targetId'] ?? '';

        Arena::vote($db, $stadiumId, $data['eventId'] ?? null, $userId, $targetId, 'silla_rate', $score);
        return self::ok(['rated' => $score]);
    }

    private static function sillaEnd(\PDO $db, string $roomId, array $data): array {
        $stadiumId = Arena::getActiveStadium($db, $roomId, Arena::F_SILLA);
        if (!$stadiumId) return self::err('Silla Caliente no activa');

        // Calcular promedio del jugador en la silla
        $stmt = $db->prepare(
            "SELECT target_id, AVG(value) as avg_score, COUNT(*) as cnt
             FROM arena_votes WHERE stadium_id = ? AND vote_type = 'silla_rate'
             GROUP BY target_id"
        );
        $stmt->execute([$stadiumId]);
        $rows = $stmt->fetchAll();

        // Premiar al de mejor puntaje (si > 4.0)
        foreach ($rows as $r) {
            if ((float)$r['avg_score'] >= 4.0 && $r['target_id']) {
                Llamas::credit($db, $r['target_id'], 60, 'silla_high_score', null, $roomId);
                Charisma::award($db, $r['target_id'], 20, 'silla_high_score');
            }
        }

        Arena::endStadium($db, $stadiumId);
        return self::ok(['scores' => $rows]);
    }

    // ─── Sobre Rojo (feature 3) — Premium ───────────────────────────────────

    private static function sobreSend(\PDO $db, string $roomId, string $userId, array $data): array {
        if (!Arena::userIsPremium($db, $userId)) return self::err('Sobre Rojo requiere Premium', 403);

        $stadiumId = Arena::getActiveStadium($db, $roomId, Arena::F_SOBRE);
        if (!$stadiumId) {
            // Auto-crear sesión si no existe
            $stadiumId = Arena::startStadium($db, $roomId, $userId, Arena::F_SOBRE);
        }
        $message = trim($data['message'] ?? '');
        if (!$message || mb_strlen($message) > 300) return self::err('Mensaje inválido');

        $mod = Ai::moderate($message);
        if ($mod && !empty($mod['flagged'])) return self::err('Mensaje no permitido');

        // Cobrar 30 LLAMAS al remitente
        try {
            Llamas::debit($db, $userId, Llamas::A_SOBRE_ROJO, Llamas::D_SOBRE_ROJO, ['stadium' => $stadiumId]);
        } catch (\RuntimeException $e) {
            return self::err($e->getMessage());
        }

        $eventId = Arena::addEvent($db, $stadiumId, 'sobre_sent', $userId, [
            'message' => $message,
            'opened'  => false,
        ]);

        RoomsController::pushEvent($db, $roomId, 'sobre:received', [
            'eventId' => $eventId,
            'hasNew'  => true,
        ]);

        return self::ok([
            'eventId'    => $eventId,
            'newBalance' => Llamas::balance($db, $userId),
        ]);
    }

    private static function sobreOpen(\PDO $db, string $roomId, string $userId, array $data): array {
        $stmt = $db->prepare('SELECT 1 FROM rooms WHERE id = ? AND host_id = ? LIMIT 1');
        $stmt->execute([$roomId, $userId]);
        if (!$stmt->fetch()) return self::err('Solo el host puede abrir sobres', 403);

        $eventId = $data['eventId'] ?? '';
        $stmt = $db->prepare('SELECT * FROM arena_events WHERE id = ? LIMIT 1');
        $stmt->execute([$eventId]);
        $event = $stmt->fetch();
        if (!$event) return self::err('Sobre no encontrado');

        $payload = json_decode($event['payload'], true);
        $payload['opened'] = true;
        $db->prepare('UPDATE arena_events SET payload = ? WHERE id = ?')
           ->execute([json_encode($payload), $eventId]);

        RoomsController::pushEvent($db, $roomId, 'sobre:opened', [
            'eventId' => $eventId,
            'message' => $payload['message'],
        ]);

        return self::ok(['message' => $payload['message']]);
    }

    private static function sobreGuess(\PDO $db, string $roomId, string $userId, array $data): array {
        $stadiumId = Arena::getActiveStadium($db, $roomId, Arena::F_SOBRE);
        if (!$stadiumId) return self::err('Sobre Rojo no activo');

        $eventId  = $data['eventId'] ?? '';
        $senderId = $data['senderId'] ?? '';
        Arena::vote($db, $stadiumId, $eventId, $userId, $senderId, 'sobre_guess');
        return self::ok(['guessed' => $senderId]);
    }

    private static function sobreReveal(\PDO $db, string $roomId, array $data): array {
        $stadiumId = Arena::getActiveStadium($db, $roomId, Arena::F_SOBRE);
        if (!$stadiumId) return self::err('Sobre Rojo no activo');

        $eventId = $data['eventId'] ?? '';
        $stmt = $db->prepare('SELECT * FROM arena_events WHERE id = ? LIMIT 1');
        $stmt->execute([$eventId]);
        $event = $stmt->fetch();
        if (!$event) return self::err('Sobre no encontrado');

        $realSender = $event['initiated_by'];
        $tally = Arena::tally($db, $stadiumId, $eventId, 'sobre_guess');

        $hits = 0;
        foreach ($tally as $r) {
            if ($r['target_id'] === $realSender) $hits = (int)$r['cnt'];
        }

        // Si NADIE adivinó, el remitente gana 100 LLAMAS
        if ($hits === 0 && $realSender) {
            Llamas::credit($db, $realSender, 100, 'sobre_unguessed', null, $stadiumId);
            Charisma::award($db, $realSender, 20, 'sobre_unguessed');
        }

        return self::ok([
            'realSender' => $realSender,
            'hits'       => $hits,
            'tally'      => $tally,
            'totalVotes' => array_sum(array_column($tally, 'cnt')),
        ]);
    }

    // ─── Quién en tu Curso (feature 5) ──────────────────────────────────────

    private static function quienStart(\PDO $db, string $roomId, string $userId): array {
        $stadiumId = Arena::getActiveStadium($db, $roomId, Arena::F_QUIEN)
                  ?? Arena::startStadium($db, $roomId, $userId, Arena::F_QUIEN);

        // Pregunta del pool de retos tipo truth o IA
        $challenge = Challenges::getChallenge($db, Challenges::TYPE_TRUTH, 2, ['quien_curso']);
        $question = $challenge['text'] ?? '¿Quién es más probable que se enamore primero?';

        $eventId = Arena::addEvent($db, $stadiumId, 'quien_question', $userId, ['question' => $question]);

        RoomsController::pushEvent($db, $roomId, 'quien:question', [
            'stadiumId' => $stadiumId,
            'eventId'   => $eventId,
            'question'  => $question,
        ]);
        return self::ok(['stadiumId' => $stadiumId, 'eventId' => $eventId, 'question' => $question]);
    }

    private static function quienVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $stadiumId = $data['stadiumId'] ?? Arena::getActiveStadium($db, $roomId, Arena::F_QUIEN);
        if (!$stadiumId) return self::err('Quién en tu Curso no activo');
        $eventId  = $data['eventId'] ?? '';
        $targetId = $data['targetId'] ?? '';
        if (!$targetId) return self::err('targetId requerido');

        Arena::vote($db, $stadiumId, $eventId, $userId, $targetId, 'quien');
        return self::ok(null);
    }

    private static function quienResults(\PDO $db, string $roomId, array $data): array {
        $stadiumId = Arena::getActiveStadium($db, $roomId, Arena::F_QUIEN);
        if (!$stadiumId) return self::err('Quién en tu Curso no activo');
        $eventId = $data['eventId'] ?? '';
        $tally   = Arena::tally($db, $stadiumId, $eventId, 'quien');
        $winner  = $tally[0]['target_id'] ?? null;

        // Acumula popularidad: +5 carisma al ganador
        if ($winner) {
            Charisma::award($db, $winner, 5, 'quien_curso_voted');
        }

        return self::ok(['winner' => $winner, 'tally' => $tally]);
    }

    // ─── Termómetro Colegio (feature 6) ─────────────────────────────────────

    private static function termArenaStart(\PDO $db, string $roomId, string $userId): array {
        $stadiumId = Arena::getActiveStadium($db, $roomId, Arena::F_TERMOMETRO)
                  ?? Arena::startStadium($db, $roomId, $userId, Arena::F_TERMOMETRO);

        $challenge = Challenges::getChallenge($db, Challenges::TYPE_TRUTH, 2, ['grupal']);
        $question = $challenge['text'] ?? '¿Qué tan atrevido es este grupo?';

        $eventId = Arena::addEvent($db, $stadiumId, 'term_question', $userId, ['question' => $question]);
        RoomsController::pushEvent($db, $roomId, 'term_arena:question', [
            'stadiumId' => $stadiumId, 'eventId' => $eventId, 'question' => $question,
        ]);
        return self::ok(['stadiumId' => $stadiumId, 'eventId' => $eventId, 'question' => $question]);
    }

    private static function termArenaVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $stadiumId = Arena::getActiveStadium($db, $roomId, Arena::F_TERMOMETRO);
        if (!$stadiumId) return self::err('Termómetro Arena no activo');
        $eventId = $data['eventId'] ?? '';
        $value   = max(1, min(10, (int)($data['value'] ?? 5)));
        Arena::vote($db, $stadiumId, $eventId, $userId, null, 'term_arena', $value);
        return self::ok(['voted' => $value]);
    }

    private static function termArenaResults(\PDO $db, string $roomId, array $data): array {
        $stadiumId = Arena::getActiveStadium($db, $roomId, Arena::F_TERMOMETRO);
        if (!$stadiumId) return self::err('Termómetro Arena no activo');
        $eventId = $data['eventId'] ?? '';
        $tally = Arena::tally($db, $stadiumId, $eventId, 'term_arena');

        // Promedio sobre todos los votos
        $stmt = $db->prepare(
            "SELECT AVG(value) avg_v, MAX(value) max_v, MIN(value) min_v, COUNT(*) cnt
             FROM arena_votes WHERE stadium_id = ? AND event_id = ? AND vote_type = 'term_arena'"
        );
        $stmt->execute([$stadiumId, $eventId]);
        $stats = $stmt->fetch();
        return self::ok([
            'average' => round((float)($stats['avg_v'] ?? 0), 2),
            'max'     => (int)($stats['max_v'] ?? 0),
            'min'     => (int)($stats['min_v'] ?? 0),
            'count'   => (int)($stats['cnt'] ?? 0),
        ]);
    }

    // ─── Momento Épico (feature 7) ──────────────────────────────────────────

    private static function epicNominate(\PDO $db, string $roomId, string $userId, array $data): array {
        $stadiumId = Arena::getActiveStadium($db, $roomId, Arena::F_EPIC)
                  ?? Arena::startStadium($db, $roomId, $userId, Arena::F_EPIC);

        $description = trim($data['description'] ?? '');
        if (!$description || mb_strlen($description) > 200) return self::err('Descripción inválida');

        $id = Arena::uuid();
        $db->prepare(
            'INSERT INTO epic_moments (id, stadium_id, nominated_by, description) VALUES (?, ?, ?, ?)'
        )->execute([$id, $stadiumId, $userId, $description]);

        RoomsController::pushEvent($db, $roomId, 'epic:nominated', [
            'epicId' => $id, 'description' => $description, 'nominatedBy' => $userId,
        ]);
        return self::ok(['epicId' => $id]);
    }

    private static function epicVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $epicId = $data['epicId'] ?? '';
        $up = (bool)($data['up'] ?? true);
        $delta = $up ? 1 : -1;
        $db->prepare('UPDATE epic_moments SET vote_count = vote_count + ? WHERE id = ?')
           ->execute([$delta, $epicId]);

        // Confirmar si pasa de 3 votos positivos
        $stmt = $db->prepare('SELECT vote_count, nominated_by, confirmed FROM epic_moments WHERE id = ? LIMIT 1');
        $stmt->execute([$epicId]);
        $epic = $stmt->fetch();
        if ($epic && (int)$epic['vote_count'] >= 3 && !(int)$epic['confirmed']) {
            $db->prepare('UPDATE epic_moments SET confirmed = 1 WHERE id = ?')->execute([$epicId]);
            Llamas::credit($db, $epic['nominated_by'], 50, 'epic_confirmed', ['epicId' => $epicId]);
            Charisma::awardEpicMoment($db, $epic['nominated_by']);
            Badges::grant($db, $epic['nominated_by'], Badges::EPIC_MOMENT);
        }
        return self::ok(['votes' => (int)$epic['vote_count']]);
    }

    private static function epicHallOfFame(\PDO $db, string $roomId): array {
        $stmt = $db->prepare(
            'SELECT em.*, u.username FROM epic_moments em
             JOIN arena_stadiums s ON s.id = em.stadium_id
             LEFT JOIN users u ON u.id = em.nominated_by
             WHERE s.room_id = ? AND em.confirmed = 1
             ORDER BY em.vote_count DESC LIMIT 20'
        );
        $stmt->execute([$roomId]);
        return self::ok(['hallOfFame' => $stmt->fetchAll()]);
    }

    // ─── Shipper (feature 9) ────────────────────────────────────────────────

    private static function shipPropose(\PDO $db, string $roomId, string $userId, array $data): array {
        $stadiumId = Arena::getActiveStadium($db, $roomId, Arena::F_SHIPPER)
                  ?? Arena::startStadium($db, $roomId, $userId, Arena::F_SHIPPER);
        $a = $data['person1'] ?? '';
        $b = $data['person2'] ?? '';
        if (!$a || !$b || $a === $b) return self::err('Necesitas 2 personas distintas');
        if (strcmp($a, $b) > 0) [$a, $b] = [$b, $a];

        $shipKey = "{$a}|{$b}";
        Arena::addEvent($db, $stadiumId, 'ship_proposed', $userId, ['ship' => $shipKey]);

        // Tomar como voto inicial del proponente
        Arena::vote($db, $stadiumId, null, $userId, $shipKey, 'ship');
        return self::ok(['ship' => $shipKey]);
    }

    private static function shipVote(\PDO $db, string $roomId, string $userId, array $data): array {
        $stadiumId = Arena::getActiveStadium($db, $roomId, Arena::F_SHIPPER);
        if (!$stadiumId) return self::err('Shipper no activo');
        $a = $data['person1'] ?? '';
        $b = $data['person2'] ?? '';
        if (!$a || !$b || $a === $b) return self::err('Necesitas 2 personas distintas');
        if (strcmp($a, $b) > 0) [$a, $b] = [$b, $a];

        Arena::vote($db, $stadiumId, null, $userId, "{$a}|{$b}", 'ship');
        return self::ok(['voted' => "{$a}|{$b}"]);
    }

    private static function shipWinner(\PDO $db, string $roomId, string $userId): array {
        $stadiumId = Arena::getActiveStadium($db, $roomId, Arena::F_SHIPPER);
        if (!$stadiumId) return self::err('Shipper no activo');

        $tally = Arena::tally($db, $stadiumId, null, 'ship');
        if (!$tally) return self::ok(['winner' => null]);

        $winner = $tally[0]['target_id'];
        [$a, $b] = explode('|', $winner);

        Arena::rewardShip($db, $a, $b, $stadiumId);
        Arena::endStadium($db, $stadiumId);

        $userInfo = $db->prepare('SELECT id, username, avatar_url FROM users WHERE id IN (?, ?)');
        $userInfo->execute([$a, $b]);
        $users = $userInfo->fetchAll();

        return self::ok([
            'winner' => ['userA' => $a, 'userB' => $b, 'votes' => (int)$tally[0]['cnt']],
            'users'  => $users,
            'tally'  => $tally,
        ]);
    }

    // ─── Ruleta + Corona (endpoints standalone) ─────────────────────────────

    public static function spinRuleta(): void {
        $payload = Auth::requireUser();
        $db      = Database::get();

        $result = Arena::ruletaSpin();

        // Aplicar efecto LLAMAS si aplica
        if ($result['llamasDelta'] > 0) {
            Llamas::credit($db, $payload['sub'], $result['llamasDelta'], 'ruleta_win');
        } elseif ($result['llamasDelta'] < 0) {
            // No fallar si balance insuficiente, solo no descontar
            try {
                Llamas::debit($db, $payload['sub'], abs($result['llamasDelta']), 'ruleta_lose');
            } catch (\RuntimeException $e) {
                $result['note'] = 'Sin LLAMAS suficientes — castigo evitado';
            }
        }

        $result['newBalance'] = Llamas::balance($db, $payload['sub']);
        Response::ok($result);
    }

    public static function corona(): void {
        Auth::requireUser();
        $db = Database::get();
        Response::ok([
            'top3'     => Arena::weeklyTop3($db),
            'awarded'  => false, // marcador para frontend
        ]);
    }

    public static function awardCorona(): void {
        Auth::requireUser();
        $db = Database::get();
        $awarded = Arena::awardWeeklyCrown($db);
        Response::ok(['awarded' => count($awarded), 'top3' => $awarded]);
    }

    // ─── Endpoints simples (compat con frontend existente) ──────────────────

    public static function startFeature(string $roomId): void {
        $payload = Auth::requireUser();
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];
        $feature = $body['feature'] ?? '';
        $db      = Database::get();

        if (!Arena::ensureMinParticipants($db, $roomId)) {
            Response::error('Arena requiere mínimo ' . Arena::MIN_PARTICIPANTS . ' participantes', 400);
        }
        if (Arena::isPremiumFeature($feature) && !Arena::userIsPremium($db, $payload['sub'])) {
            Response::error("La feature {$feature} requiere Premium", 403);
        }

        $stadiumId = Arena::startStadium($db, $roomId, $payload['sub'], $feature);
        RoomsController::pushEvent($db, $roomId, 'arena:feature_started', [
            'stadiumId' => $stadiumId, 'feature' => $feature,
        ]);
        Response::ok(['stadiumId' => $stadiumId, 'feature' => $feature]);
    }

    public static function vote(string $stadiumId): void {
        // Legacy compat
        $payload  = Auth::requireUser();
        $body     = json_decode(file_get_contents('php://input'), true) ?? [];
        $targetId = $body['targetId'] ?? null;
        $voteType = $body['voteType'] ?? 'default';
        $value    = isset($body['value']) ? (int)$body['value'] : null;
        $db       = Database::get();

        Arena::vote($db, $stadiumId, $body['eventId'] ?? null, $payload['sub'], $targetId, $voteType, $value);
        $tally = Arena::tally($db, $stadiumId, $body['eventId'] ?? null, $voteType);
        Response::ok(['count' => array_sum(array_column($tally, 'cnt')), 'tally' => $tally]);
    }

    public static function results(string $stadiumId): void {
        Auth::requireUser();
        $db = Database::get();
        $stmt = $db->prepare(
            'SELECT vote_type, target_id, COUNT(*) cnt FROM arena_votes WHERE stadium_id = ? GROUP BY vote_type, target_id ORDER BY cnt DESC'
        );
        $stmt->execute([$stadiumId]);
        Response::ok(['rows' => $stmt->fetchAll()]);
    }

    public static function end(string $stadiumId): void {
        Auth::requireUser();
        $db = Database::get();
        Arena::endStadium($db, $stadiumId);
        Response::ok(null);
    }

    // ─── Helpers ────────────────────────────────────────────────────────────
    private static function ok(mixed $data): array { return ['success' => true, 'data' => $data]; }
    private static function err(string $msg, int $status = 400): array { return ['success' => false, 'error' => $msg, 'status' => $status]; }
}
