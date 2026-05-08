<?php
namespace BF;

class Auth {
    public static function requireUser(): array {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!str_starts_with($header, 'Bearer ')) {
            Response::error('No autenticado', 401);
        }
        $token   = substr($header, 7);
        $payload = JWT::decode($token, JWT_SECRET);
        if (!$payload || empty($payload['sub'])) {
            Response::error('Token inválido o expirado', 401);
        }
        return $payload;
    }

    public static function optionalUser(): ?array {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!str_starts_with($header, 'Bearer ')) return null;
        $token   = substr($header, 7);
        return JWT::decode($token, JWT_SECRET);
    }

    public static function makeTokens(string $userId, string $email, bool $isPremium): array {
        $now = time();
        $access = JWT::encode([
            'sub'       => $userId,
            'email'     => $email,
            'isPremium' => $isPremium,
            'iat'       => $now,
            'exp'       => $now + JWT_TTL,
        ], JWT_SECRET);

        $refresh = JWT::encode([
            'sub'       => $userId,
            'email'     => $email,
            'isPremium' => $isPremium,
            'iat'       => $now,
            'exp'       => $now + JWT_REFRESH_TTL,
        ], JWT_REFRESH_SECRET);

        return ['accessToken' => $access, 'refreshToken' => $refresh];
    }
}
