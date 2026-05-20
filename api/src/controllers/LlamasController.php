<?php
namespace BF\Controllers;

use BF\{Database, Auth, Response, Llamas};

class LlamasController {
    public static function balance(): void {
        $payload = Auth::requireUser();
        $db      = Database::get();
        $bal     = Llamas::balance($db, $payload['sub']);
        Response::ok(['balance' => $bal]);
    }

    public static function history(): void {
        $payload = Auth::requireUser();
        $page    = max(1, (int)($_GET['page'] ?? 1));
        $limit   = min(50, max(1, (int)($_GET['limit'] ?? 20)));
        $db      = Database::get();

        $countStmt = $db->prepare('SELECT COUNT(*) FROM llamas_transactions WHERE user_id = ?');
        $countStmt->execute([$payload['sub']]);
        $total = (int)$countStmt->fetchColumn();

        $stmt = $db->prepare(
            'SELECT id, amount, type, reason, metadata, session_id, created_at
             FROM llamas_transactions WHERE user_id = ?
             ORDER BY created_at DESC LIMIT ? OFFSET ?'
        );
        $stmt->execute([$payload['sub'], $limit, ($page - 1) * $limit]);
        $items = array_map(static function (array $r): array {
            $r['amount']   = (int)$r['amount'];
            $r['metadata'] = $r['metadata'] ? json_decode($r['metadata'], true) : null;
            return $r;
        }, $stmt->fetchAll());

        Response::ok([
            'items'   => $items,
            'total'   => $total,
            'page'    => $page,
            'limit'   => $limit,
            'balance' => Llamas::balance($db, $payload['sub']),
        ]);
    }

    // POST /api/llamas/spend — gastar LLAMAS en una función de la app
    public static function spend(): void {
        $payload = Auth::requireUser();
        $userId  = $payload['sub'];
        $db      = Database::get();
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];
        $feature = $body['feature'] ?? '';

        $costs = [
            'quien_te_voto'    => 20,
            'genero_sobre'     => 50,
            'termometro_exacto'=> 100,
            'visitas_perfil'   => 150,
            'modo_fantasma'    => 200,
            'boost_perfil'     => 500,
        ];

        if (!isset($costs[$feature])) {
            Response::error('Función no válida', 400);
        }

        $cost = $costs[$feature];
        $bal  = Llamas::balance($db, $userId);
        if ($bal < $cost) {
            Response::error("LLAMAS insuficientes. Necesitas {$cost}, tienes {$bal}", 402);
        }

        Llamas::debit($db, $userId, $cost, $feature, [], null);

        $result = match($feature) {
            'modo_fantasma'  => ['active' => true, 'hours' => 24],
            'boost_perfil'   => ['active' => true, 'hours' => 24],
            default          => ['unlocked' => true],
        };

        Response::ok([
            'feature' => $feature,
            'cost'    => $cost,
            'balance' => Llamas::balance($db, $userId),
            'result'  => $result,
        ]);
    }

    // GET /api/llamas/daily — reclamar bono diario (idempotente)
    public static function claimDaily(): void {
        $payload = Auth::requireUser();
        $db      = Database::get();
        $awarded = Llamas::awardDailyIfNeeded($db, $payload['sub']);
        Response::ok([
            'claimed'  => $awarded,
            'amount'   => $awarded ? Llamas::A_DAILY : 0,
            'balance'  => Llamas::balance($db, $payload['sub']),
            'message'  => $awarded ? 'Bono diario reclamado' : 'Ya reclamaste el bono hoy',
        ]);
    }
}
