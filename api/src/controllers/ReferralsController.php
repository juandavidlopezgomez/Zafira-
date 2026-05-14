<?php
namespace BF\Controllers;

use BF\{Database, Auth, Response, Referrals};

class ReferralsController {

    // GET /referrals/code  — devuelve código + stats
    public static function myCode(): void {
        $payload = Auth::requireUser();
        $db      = Database::get();
        Response::ok(Referrals::stats($db, $payload['sub']));
    }

    // POST /referrals/apply
    // Body: { code }
    public static function apply(): void {
        $payload = Auth::requireUser();
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];
        $code    = trim($body['code'] ?? '');
        if (!$code) Response::error('Código requerido');

        $db = Database::get();

        // Verificar que el usuario no tenga ya un referido
        $stmt = $db->prepare('SELECT referred_by FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$payload['sub']]);
        $already = $stmt->fetchColumn();
        if ($already) Response::error('Ya aplicaste un código de referido', 409);

        $ok = Referrals::applyCode($db, $payload['sub'], $code);
        if (!$ok) Response::error('Código inválido o ya usado', 400);

        Response::ok(['message' => 'Código aplicado. Ganaste 50 LLAMAS bonus!', 'bonus' => 50]);
    }

    // GET /referrals/stats
    public static function stats(): void {
        $payload = Auth::requireUser();
        $db      = Database::get();
        $stats   = Referrals::stats($db, $payload['sub']);

        // Lista de referidos
        $stmt = $db->prepare(
            'SELECT u.username, u.avatar_url, r.created_at, r.rewarded_at
             FROM referrals r
             JOIN users u ON u.id = r.referred_id
             WHERE r.referrer_id = ?
             ORDER BY r.created_at DESC LIMIT 50'
        );
        $stmt->execute([$payload['sub']]);
        $stats['referred'] = $stmt->fetchAll();

        Response::ok($stats);
    }

    // GET /beta/validate?code=XXXX
    public static function validateBeta(): void {
        $code = trim($_GET['code'] ?? '');
        if (!$code) Response::error('Código requerido');
        $db   = Database::get();
        $valid = Referrals::validateBetaCode($db, $code);
        Response::ok(['valid' => $valid, 'code' => strtoupper($code)]);
    }

    // POST /beta/redeem
    // Body: { code }
    public static function redeemBeta(): void {
        $payload = Auth::requireUser();
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];
        $code    = trim($body['code'] ?? '');
        if (!$code) Response::error('Código requerido');

        $db = Database::get();
        $ok = Referrals::redeemBetaCode($db, $payload['sub'], $code);
        if (!$ok) Response::error('Código beta inválido, expirado o ya usado', 400);

        Response::ok([
            'message' => '¡Código beta activado! +150 LLAMAS y badge Beta Tester',
            'bonus'   => 150,
            'badge'   => 'beta_tester',
        ]);
    }

    // POST /beta/create  (solo admin — verifica env)
    public static function createBeta(): void {
        // Protección simple: solo desde servidor (sin JWT requerido, verificar header secreto)
        $adminKey = $_SERVER['HTTP_X_ADMIN_KEY'] ?? '';
        if (!defined('ADMIN_SECRET') || $adminKey !== ADMIN_SECRET) {
            Response::error('Unauthorized', 401);
        }
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $db   = Database::get();
        $code = Referrals::createBetaCode(
            $db,
            $body['code']      ?? null,
            $body['expiresAt'] ?? null
        );
        Response::ok(['code' => $code]);
    }
}
