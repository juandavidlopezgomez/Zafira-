<?php
namespace BF\Controllers;

use BF\{Database, Auth, Response, Challenges};

class ChallengesController {
    // GET /api/challenges/random?type=truth&intensity=2&tags=flirteo,general
    public static function random(): void {
        $payload  = Auth::requireUser();
        $type     = trim($_GET['type'] ?? Challenges::TYPE_TRUTH);
        $intensity = max(1, min(5, (int)($_GET['intensity'] ?? 2)));
        $tagsRaw  = trim($_GET['tags'] ?? '');
        $tags     = $tagsRaw ? array_map('trim', explode(',', $tagsRaw)) : [];

        $valid = [Challenges::TYPE_TRUTH, Challenges::TYPE_DARE, Challenges::TYPE_BATTLE, Challenges::TYPE_DARK];
        if (!in_array($type, $valid, true)) Response::error('type inválido. Usa: truth, dare, battle, dark');

        $db = Database::get();
        $challenge = Challenges::getChallenge($db, $type, $intensity, $tags, $payload['sub']);
        if (!$challenge) {
            Response::error('No hay retos disponibles para este contexto', 404);
        }

        Response::ok($challenge);
    }

    // GET /api/challenges?type=truth — listar pool (admin/debug)
    public static function list(): void {
        Auth::requireUser();
        $type = $_GET['type'] ?? null;
        $db   = Database::get();
        $list = Challenges::listPool($db, $type);
        Response::ok([
            'total' => count($list),
            'items' => $list,
        ]);
    }

    // POST /api/challenges/seed — sembrar pool inicial (idempotente)
    public static function seed(): void {
        Auth::requireUser();
        $db = Database::get();
        $inserted = Challenges::seedDefaults($db);
        $total = (int) $db->query('SELECT COUNT(*) FROM challenges')->fetchColumn();
        Response::ok([
            'inserted' => $inserted,
            'total'    => $total,
            'message'  => "Pool de retos: {$inserted} nuevos insertados, {$total} totales",
        ]);
    }
}
