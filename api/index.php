<?php
declare(strict_types=1);

// ─── Bootstrap ───────────────────────────────────────────────────────────────
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/src/Database.php';
require_once __DIR__ . '/src/JWT.php';
require_once __DIR__ . '/src/Response.php';
require_once __DIR__ . '/src/Auth.php';
require_once __DIR__ . '/src/controllers/AuthController.php';
require_once __DIR__ . '/src/controllers/RoomsController.php';
require_once __DIR__ . '/src/controllers/GameController.php';
require_once __DIR__ . '/src/controllers/LlamasController.php';
require_once __DIR__ . '/src/controllers/HiloController.php';
require_once __DIR__ . '/src/controllers/ArenaController.php';

use BF\Response;
use BF\Controllers\{AuthController, RoomsController, GameController,
                    LlamasController, HiloController, ArenaController};

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

match (true) {

    // ── Auth ─────────────────────────────────────────────────────────────────
    $method === 'POST' && $s0 === 'auth' && $s1 === 'register'
        => AuthController::register(),

    $method === 'POST' && $s0 === 'auth' && $s1 === 'login'
        => AuthController::login(),

    $method === 'POST' && $s0 === 'auth' && $s1 === 'refresh'
        => AuthController::refresh(),

    $method === 'GET'  && $s0 === 'auth' && $s1 === 'me'
        => AuthController::me(),

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

    // ── Hilo ─────────────────────────────────────────────────────────────────
    $method === 'GET'  && $s0 === 'hilo' && $s1 && $s2 === 'messages'
        => HiloController::messages($s1),

    $method === 'POST' && $s0 === 'hilo' && $s1 && $s2 === 'messages'
        => HiloController::send($s1),

    $method === 'POST' && $s0 === 'hilo' && $s1 && $s2 === 'react'
        => HiloController::react($s1),

    // ── Arena ────────────────────────────────────────────────────────────────
    $method === 'POST' && $s0 === 'arena' && $s1 && $s2 === 'start'
        => ArenaController::startFeature($s1),

    $method === 'POST' && $s0 === 'arena' && $s1 && $s2 === 'vote'
        => ArenaController::vote($s1),

    $method === 'GET'  && $s0 === 'arena' && $s1 && $s2 === 'results'
        => ArenaController::results($s1),

    $method === 'POST' && $s0 === 'arena' && $s1 && $s2 === 'end'
        => ArenaController::end($s1),

    $method === 'GET'  && $s0 === 'arena' && $s1 === 'ruleta'
        => ArenaController::spinRuleta(),

    // ── 404 ──────────────────────────────────────────────────────────────────
    default => Response::error("Ruta no encontrada: {$method} {$uri}", 404),
};
