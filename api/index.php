<?php
declare(strict_types=1);

// Mostrar errores como JSON (útil en producción para debug)
set_exception_handler(function (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => $e->getMessage(), 'file' => basename($e->getFile()), 'line' => $e->getLine()]);
    exit;
});
set_error_handler(function ($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/src/Database.php';
require_once __DIR__ . '/src/JWT.php';
require_once __DIR__ . '/src/Response.php';
require_once __DIR__ . '/src/Auth.php';
require_once __DIR__ . '/src/Llamas.php';
require_once __DIR__ . '/src/Badges.php';
require_once __DIR__ . '/src/Charisma.php';
require_once __DIR__ . '/src/Interest.php';
require_once __DIR__ . '/src/Ai.php';
require_once __DIR__ . '/src/Challenges.php';
require_once __DIR__ . '/src/Hilo.php';
require_once __DIR__ . '/src/Arena.php';
require_once __DIR__ . '/src/Premium.php';
require_once __DIR__ . '/src/Referrals.php';
require_once __DIR__ . '/src/controllers/AuthController.php';
require_once __DIR__ . '/src/controllers/UsersController.php';
require_once __DIR__ . '/src/controllers/ChallengesController.php';
require_once __DIR__ . '/src/controllers/RoomsController.php';
require_once __DIR__ . '/src/controllers/GameController.php';
require_once __DIR__ . '/src/controllers/LlamasController.php';
require_once __DIR__ . '/src/controllers/HiloController.php';
require_once __DIR__ . '/src/controllers/ArenaController.php';
require_once __DIR__ . '/src/controllers/PaymentsController.php';
require_once __DIR__ . '/src/controllers/ReferralsController.php';

use BF\{Response, Database};
use BF\Controllers\{AuthController, UsersController, RoomsController, GameController,
                    LlamasController, HiloController, ArenaController, ChallengesController,
                    PaymentsController, ReferralsController};

// ─── CORS ────────────────────────────────────────────────────────────────────
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = defined('FRONTEND_URL') ? FRONTEND_URL : '*';
header('Access-Control-Allow-Origin: ' . ($allowed === '*' ? '*' : $origin));
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ─── Router ──────────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Quitar prefijo /api si viene desde el .htaccess
$uri = preg_replace('#^/api#', '', $uri);
$uri = rtrim($uri, '/') ?: '/';

// Segmentos: /auth/register → ['auth','register']
$segs = array_values(array_filter(explode('/', $uri)));

$s0 = $segs[0] ?? '';
$s1 = $segs[1] ?? '';
$s2 = $segs[2] ?? '';
$s3 = $segs[3] ?? '';

match (true) {

    // ── Install (crea tablas desde database/schema.sql) ──────────────────────
    $method === 'GET' && $s0 === 'install'
        => (function () {
            $sqlFile = __DIR__ . '/../database/schema.sql';
            if (!file_exists($sqlFile)) {
                Response::error('schema.sql no encontrado en ' . $sqlFile, 500);
            }
            $sql = file_get_contents($sqlFile);
            // Quitar líneas de comentario (--) antes de dividir
            $sql = preg_replace('/^\s*--.*$/m', '', $sql);
            $db  = Database::get();
            $created = [];
            $errors  = [];
            $statements = array_filter(array_map('trim', explode(';', $sql)));
            foreach ($statements as $stmt) {
                if ($stmt === '') continue;
                try {
                    $db->exec($stmt);
                    if (preg_match('/CREATE TABLE.*?`(\w+)`/is', $stmt, $m)) {
                        $created[] = $m[1];
                    }
                } catch (\Throwable $e) {
                    $errors[] = ['stmt' => substr($stmt, 0, 100), 'error' => $e->getMessage()];
                }
            }
            $tables = $db->query("SHOW TABLES")->fetchAll(\PDO::FETCH_COLUMN);
            Response::ok([
                'created' => $created,
                'errors'  => $errors,
                'tables'  => $tables,
            ]);
        })(),

    // ── Health / diagnóstico ─────────────────────────────────────────────────
    $method === 'GET' && $s0 === 'health'
        => (function () {
            $info = [
                'php_version' => PHP_VERSION,
                'pdo_mysql'   => extension_loaded('pdo_mysql'),
                'db'          => 'unknown',
                'tables'      => [],
            ];
            try {
                $db = Database::get();
                $info['db'] = 'ok';
                $info['tables'] = $db->query("SHOW TABLES")->fetchAll(\PDO::FETCH_COLUMN);
            } catch (\Throwable $e) {
                $info['db'] = 'fail: ' . $e->getMessage();
            }
            Response::ok($info);
        })(),

    // ── Auth ─────────────────────────────────────────────────────────────────
    $method === 'POST' && $s0 === 'auth' && $s1 === 'register'
        => AuthController::register(),

    $method === 'POST' && $s0 === 'auth' && $s1 === 'login'
        => AuthController::login(),

    $method === 'POST' && $s0 === 'auth' && $s1 === 'refresh'
        => AuthController::refresh(),

    $method === 'GET'  && $s0 === 'auth' && $s1 === 'me'
        => AuthController::me(),

    // ── Users (perfil + carisma + insignias) ─────────────────────────────────
    $method === 'GET' && $s0 === 'users' && $s1 === 'me' && $s2 === 'profile'
        => UsersController::meProfile(),

    $method === 'GET' && $s0 === 'users' && $s1 === 'me' && $s2 === 'charisma'
        => UsersController::meCharisma(),

    $method === 'GET' && $s0 === 'users' && $s1 === 'me' && $s2 === 'badges'
        => UsersController::meBadges(),

    $method === 'GET' && $s0 === 'users' && $s1 && $s2 === 'profile'
        => UsersController::publicProfile($s1),

    // ── Rooms ────────────────────────────────────────────────────────────────
    $method === 'POST' && $s0 === 'rooms' && !$s1
        => RoomsController::create(),

    $method === 'GET'  && $s0 === 'rooms' && $s1
        => RoomsController::findByCode($s1),

    $method === 'POST' && $s0 === 'rooms' && $s1 && $s2 === 'join'
        => RoomsController::join($s1),

    $method === 'POST' && $s0 === 'rooms' && $s1 && $s2 === 'leave'
        => RoomsController::leave($s1),

    $method === 'GET'  && $s0 === 'rooms' && $s1 && $s2 === 'players'
        => RoomsController::players($s1),

    $method === 'GET'  && $s0 === 'rooms' && $s1 && $s2 === 'state'
        => RoomsController::state($s1),

    // Matches reveal-only
    $method === 'POST' && $s0 === 'rooms' && $s1 && $s2 === 'interest'
        => RoomsController::signalInterest($s1),

    $method === 'GET'  && $s0 === 'rooms' && $s1 && $s2 === 'interest' && $s3 === 'me'
        => RoomsController::myInterest($s1),

    $method === 'POST' && $s0 === 'rooms' && $s1 && $s2 === 'end'
        => RoomsController::end($s1),

    // ── Game ─────────────────────────────────────────────────────────────────
    $method === 'POST' && $s0 === 'game' && $s1 && $s2 === 'action'
        => GameController::action($s1),

    $method === 'GET'  && $s0 === 'game' && $s1 && $s2 === 'events'
        => GameController::events($s1),

    // ── Llamas ───────────────────────────────────────────────────────────────
    $method === 'GET'  && $s0 === 'llamas' && $s1 === 'balance'
        => LlamasController::balance(),

    $method === 'GET'  && $s0 === 'llamas' && $s1 === 'history'
        => LlamasController::history(),

    $method === 'POST' && $s0 === 'llamas' && $s1 === 'daily'
        => LlamasController::claimDaily(),

    $method === 'POST' && $s0 === 'llamas' && $s1 === 'spend'
        => LlamasController::spend(),

    // ── Challenges (pool + IA fallback) ──────────────────────────────────────
    $method === 'GET'  && $s0 === 'challenges' && $s1 === 'random'
        => ChallengesController::random(),

    $method === 'GET'  && $s0 === 'challenges' && !$s1
        => ChallengesController::list(),

    $method === 'POST' && $s0 === 'challenges' && $s1 === 'seed'
        => ChallengesController::seed(),

    // ── Hilo ─────────────────────────────────────────────────────────────────
    $method === 'GET'  && $s0 === 'hilo' && $s1 && $s2 === 'messages'
        => HiloController::messages($s1),

    $method === 'POST' && $s0 === 'hilo' && $s1 && $s2 === 'messages'
        => HiloController::send($s1),

    $method === 'POST' && $s0 === 'hilo' && $s1 && $s2 === 'react'
        => HiloController::react($s1),

    $method === 'POST' && $s0 === 'hilo' && $s1 && $s2 === 'confession'
        => HiloController::confession($s1),

    $method === 'GET'  && $s0 === 'hilo' && $s1 && $s2 === 'tension'
        => HiloController::tension($s1),

    // ── Arena ────────────────────────────────────────────────────────────────
    $method === 'POST' && $s0 === 'arena' && $s1 && $s2 === 'start'
        => ArenaController::startFeature($s1),

    // Dispatcher genérico de las 9 features (silla, sobre, quién, term, epic, ship)
    $method === 'POST' && $s0 === 'arena' && $s1 && $s2 === 'action'
        => ArenaController::action($s1),

    $method === 'POST' && $s0 === 'arena' && $s1 && $s2 === 'vote'
        => ArenaController::vote($s1),

    $method === 'GET'  && $s0 === 'arena' && $s1 && $s2 === 'results'
        => ArenaController::results($s1),

    $method === 'POST' && $s0 === 'arena' && $s1 && $s2 === 'end'
        => ArenaController::end($s1),

    $method === 'GET'  && $s0 === 'arena' && $s1 === 'ruleta'
        => ArenaController::spinRuleta(),

    // Corona Semanal (global, no per-room)
    $method === 'GET'  && $s0 === 'arena' && $s1 === 'corona'
        => ArenaController::corona(),

    $method === 'POST' && $s0 === 'arena' && $s1 === 'corona' && $s2 === 'award'
        => ArenaController::awardCorona(),

    // ── Payments (Stripe) ────────────────────────────────────────────────────
    $method === 'POST' && $s0 === 'payments' && $s1 === 'create-subscription'
        => PaymentsController::createSubscription(),

    $method === 'GET'  && $s0 === 'payments' && $s1 === 'status'
        => PaymentsController::status(),

    $method === 'POST' && $s0 === 'payments' && $s1 === 'cancel'
        => PaymentsController::cancel(),

    $method === 'POST' && $s0 === 'payments' && $s1 === 'webhook'
        => PaymentsController::webhook(),

    // ── Referrals ────────────────────────────────────────────────────────────
    $method === 'GET'  && $s0 === 'referrals' && $s1 === 'code'
        => ReferralsController::myCode(),

    $method === 'POST' && $s0 === 'referrals' && $s1 === 'apply'
        => ReferralsController::apply(),

    $method === 'GET'  && $s0 === 'referrals' && $s1 === 'stats'
        => ReferralsController::stats(),

    // ── Beta codes ───────────────────────────────────────────────────────────
    $method === 'GET'  && $s0 === 'beta' && $s1 === 'validate'
        => ReferralsController::validateBeta(),

    $method === 'POST' && $s0 === 'beta' && $s1 === 'redeem'
        => ReferralsController::redeemBeta(),

    $method === 'POST' && $s0 === 'beta' && $s1 === 'create'
        => ReferralsController::createBeta(),

    // ── 404 ──────────────────────────────────────────────────────────────────
    default => Response::error("Ruta no encontrada: {$method} {$uri}", 404),
};
