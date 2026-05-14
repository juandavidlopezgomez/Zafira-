<?php
namespace BF\Controllers;

use BF\{Database, Auth, Response, JWT, Llamas, Referrals};

class AuthController {
    public static function register(): void {
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $username    = trim($body['username'] ?? '');
        $email       = strtolower(trim($body['email'] ?? ''));
        $password    = $body['password'] ?? '';
        $age         = isset($body['age']) ? (int)$body['age'] : null;
        $referralCode = trim($body['referralCode'] ?? '');

        if (!$username || !$email || !$password) {
            Response::error('username, email y password son requeridos');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Email inválido');
        }
        if (strlen($password) < 8) {
            Response::error('La contraseña debe tener al menos 8 caracteres');
        }

        $db = Database::get();

        $stmt = $db->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        if ($stmt->fetch()) Response::error('El email ya está registrado', 409);

        $stmt = $db->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
        $stmt->execute([$username]);
        if ($stmt->fetch()) Response::error('El username ya está en uso', 409);

        $id           = self::uuid();
        $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
        $myRefCode    = 'BF-' . strtoupper(substr($id, 0, 8));

        $db->prepare(
            'INSERT INTO users (id, username, email, password_hash, referral_code, age) VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$id, $username, $email, $passwordHash, $myRefCode, $age]);

        Llamas::awardWelcome($db, $id);

        // Aplicar código de referido si fue proporcionado
        if ($referralCode) {
            Referrals::applyCode($db, $id, $referralCode);
        }

        $tokens = Auth::makeTokens($id, $email, false);

        Response::ok([
            ...$tokens,
            'token' => $tokens['accessToken'], // alias for compatibility
            'user'  => [
                'id'            => $id,
                'username'      => $username,
                'email'         => $email,
                'isPremium'     => false,
                'current_rank'  => 1,
                'llamasBalance' => LLAMAS_INITIAL_BALANCE,
            ],
        ]);
    }

    public static function login(): void {
        $body     = json_decode(file_get_contents('php://input'), true) ?? [];
        $email    = strtolower(trim($body['email'] ?? ''));
        $password = $body['password'] ?? '';

        if (!$email || !$password) Response::error('Email y password requeridos');

        $db   = Database::get();
        $stmt = $db->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            Response::error('Credenciales inválidas', 401);
        }

        $balance = Llamas::balance($db, $user['id']);
        $tokens  = Auth::makeTokens($user['id'], $user['email'], (bool)$user['is_premium']);

        Response::ok([
            ...$tokens,
            'token' => $tokens['accessToken'], // alias for compatibility
            'user'  => [
                'id'            => $user['id'],
                'username'      => $user['username'],
                'email'         => $user['email'],
                'isPremium'     => (bool)$user['is_premium'],
                'current_rank'  => (int)($user['current_rank'] ?? 1),
                'llamasBalance' => $balance,
            ],
        ]);
    }

    public static function refresh(): void {
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];
        $token   = $body['refreshToken'] ?? '';
        $payload = JWT::decode($token, JWT_REFRESH_SECRET);
        if (!$payload) Response::error('Refresh token inválido o expirado', 401);

        $tokens = Auth::makeTokens($payload['sub'], $payload['email'], $payload['isPremium']);
        Response::ok($tokens);
    }

    public static function me(): void {
        $payload = Auth::requireUser();
        $db      = Database::get();

        $stmt = $db->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$payload['sub']]);
        $user = $stmt->fetch();
        if (!$user) Response::error('Usuario no encontrado', 404);

        $balance = Llamas::balance($db, $user['id']);

        Response::ok([
            'id'             => $user['id'],
            'username'       => $user['username'],
            'email'          => $user['email'],
            'avatarUrl'      => $user['avatar_url'],
            'age'            => $user['age'] ? (int)$user['age'] : null,
            'ageVerified'    => (bool)($user['age_verified'] ?? false),
            'isPremium'      => (bool)$user['is_premium'],
            'charismaPoints' => (int)($user['charisma_points'] ?? 0),
            'currentRank'    => (int)($user['current_rank'] ?? 1),
            'referralCode'   => $user['referral_code'],
            'llamasBalance'  => $balance,
            'createdAt'      => $user['created_at'],
        ]);
    }

    private static function uuid(): string {
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );
    }
}
