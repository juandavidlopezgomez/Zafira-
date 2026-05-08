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
