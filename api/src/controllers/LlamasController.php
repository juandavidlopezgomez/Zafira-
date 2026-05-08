<?php
namespace BF\Controllers;

use BF\{Database, Auth, Response};

class LlamasController {
    public static function balance(): void {
        $payload = Auth::requireUser();
        $db      = Database::get();
        $bal     = self::getBalance($db, $payload['sub']);
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
            'SELECT id, amount, reason, session_id, created_at
             FROM llamas_transactions WHERE user_id = ?
             ORDER BY created_at DESC LIMIT ? OFFSET ?'
        );
        $stmt->execute([$payload['sub'], $limit, ($page - 1) * $limit]);
        $items = $stmt->fetchAll();

        Response::ok(['items' => $items, 'total' => (int)$total]);
    }

    public static function getBalance(\PDO $db, string $userId): int {
        $stmt = $db->prepare('SELECT COALESCE(SUM(amount),0) FROM llamas_transactions WHERE user_id = ?');
        $stmt->execute([$userId]);
        return (int)$stmt->fetchColumn();
    }

    public static function credit(\PDO $db, string $userId, int $amount, string $reason, ?string $sessionId = null): void {
        $id = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0,0xffff),mt_rand(0,0xffff),mt_rand(0,0xffff),
            mt_rand(0,0x0fff)|0x4000,mt_rand(0,0x3fff)|0x8000,
            mt_rand(0,0xffff),mt_rand(0,0xffff),mt_rand(0,0xffff));
        $db->prepare('INSERT INTO llamas_transactions (id,user_id,amount,reason,session_id) VALUES (?,?,?,?,?)')
           ->execute([$id, $userId, abs($amount), $reason, $sessionId]);
    }
}
