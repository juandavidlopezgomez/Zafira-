<?php
namespace BF;

use PDO;

/**
 * Sistema de referidos y beta codes.
 * - Código único por usuario generado al registrarse
 * - +100 LLAMAS al referidor cuando el referido completa su 1er juego
 * - +50 LLAMAS al referido en la bienvenida si usó código
 * - Beta codes: BETA-XXXXXXXX, un solo uso
 */
class Referrals {
    public const REFERRER_REWARD = 100; // LLAMAS al referidor
    public const REFERRED_BONUS  =  50; // LLAMAS extra al referido

    // ─── Generar código único de referido ────────────────────────────────────
    public static function generateCode(PDO $db): string {
        do {
            $code = 'BF-' . strtoupper(substr(str_replace(['+','/','='], '', base64_encode(random_bytes(6))), 0, 8));
            $exists = $db->prepare('SELECT 1 FROM users WHERE referral_code = ? LIMIT 1');
            $exists->execute([$code]);
        } while ($exists->fetchColumn());
        return $code;
    }

    // ─── Asignar código a usuario (si no tiene) ──────────────────────────────
    public static function ensureCode(PDO $db, string $userId): string {
        $stmt = $db->prepare('SELECT referral_code FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $code = $stmt->fetchColumn();
        if ($code) return (string)$code;

        $code = self::generateCode($db);
        $db->prepare('UPDATE users SET referral_code = ? WHERE id = ?')
           ->execute([$code, $userId]);
        return $code;
    }

    // ─── Aplicar código de referido al registrarse ───────────────────────────
    public static function applyCode(PDO $db, string $newUserId, string $code): bool {
        // Buscar referidor por código
        $stmt = $db->prepare('SELECT id FROM users WHERE referral_code = ? LIMIT 1');
        $stmt->execute([strtoupper(trim($code))]);
        $referrerId = $stmt->fetchColumn();

        if (!$referrerId || $referrerId === $newUserId) return false;

        // Verificar que no tenga ya un referido registrado
        $existing = $db->prepare('SELECT 1 FROM referrals WHERE referred_id = ? LIMIT 1');
        $existing->execute([$newUserId]);
        if ($existing->fetchColumn()) return false;

        // Registrar referido
        $id = self::uuid();
        $db->prepare(
            'INSERT INTO referrals (id, referrer_id, referred_id) VALUES (?, ?, ?)'
        )->execute([$id, $referrerId, $newUserId]);

        // Guardar referrer en el usuario
        $db->prepare('UPDATE users SET referred_by = ? WHERE id = ?')
           ->execute([$referrerId, $newUserId]);

        // Bonus inmediato al nuevo usuario
        Llamas::credit($db, $newUserId, self::REFERRED_BONUS, 'referral_bonus', ['referrer_id' => $referrerId], null);

        // Verificar badge de referidos
        Badges::checkReferralBadges($db, $referrerId);

        return true;
    }

    // ─── Premiar al referidor cuando el referido completa su 1er juego ───────
    public static function rewardReferrerOnFirstGame(PDO $db, string $referredId): void {
        $stmt = $db->prepare(
            'SELECT referrer_id, rewarded_at FROM referrals WHERE referred_id = ? LIMIT 1'
        );
        $stmt->execute([$referredId]);
        $ref = $stmt->fetch();

        if (!$ref || $ref['rewarded_at']) return; // ya fue premiado

        $db->prepare(
            'UPDATE referrals SET rewarded_at = NOW() WHERE referred_id = ?'
        )->execute([$referredId]);

        Llamas::credit($db, $ref['referrer_id'], self::REFERRER_REWARD, 'referral_reward', ['referred_id' => $referredId], null);
        Charisma::award($db, $ref['referrer_id'], 20, 'referral_reward');
        Badges::checkReferralBadges($db, $ref['referrer_id']);
    }

    // ─── Estadísticas de referidos ───────────────────────────────────────────
    public static function stats(PDO $db, string $userId): array {
        $code = self::ensureCode($db, $userId);

        $stmt = $db->prepare(
            'SELECT COUNT(*) as total,
                    SUM(rewarded_at IS NOT NULL) as rewarded
             FROM referrals WHERE referrer_id = ?'
        );
        $stmt->execute([$userId]);
        $counts = $stmt->fetch();

        $earned = (int)$counts['rewarded'] * self::REFERRER_REWARD;

        return [
            'code'         => $code,
            'totalReferred'=> (int)$counts['total'],
            'rewarded'     => (int)$counts['rewarded'],
            'llamasEarned' => $earned,
            'shareUrl'     => (defined('FRONTEND_URL') ? FRONTEND_URL : '') . '/?ref=' . $code,
        ];
    }

    // ─── Beta codes ─────────────────────────────────────────────────────────

    public static function validateBetaCode(PDO $db, string $code): bool {
        $stmt = $db->prepare(
            "SELECT 1 FROM beta_codes
             WHERE code = ? AND used_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
             LIMIT 1"
        );
        $stmt->execute([strtoupper(trim($code))]);
        return (bool)$stmt->fetchColumn();
    }

    public static function redeemBetaCode(PDO $db, string $userId, string $code): bool {
        $code = strtoupper(trim($code));
        $stmt = $db->prepare(
            "SELECT id FROM beta_codes
             WHERE code = ? AND used_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
             LIMIT 1"
        );
        $stmt->execute([$code]);
        $id = $stmt->fetchColumn();
        if (!$id) return false;

        $db->prepare(
            "UPDATE beta_codes SET used_at = NOW(), used_by = ? WHERE id = ?"
        )->execute([$userId, $id]);

        // Bonus por usar beta code
        Llamas::credit($db, $userId, 150, 'beta_code_bonus', ['code' => $code], null);
        Badges::grant($db, $userId, 'beta_tester');

        return true;
    }

    // Crear beta code (admin-only por ahora)
    public static function createBetaCode(PDO $db, ?string $code = null, ?string $expiresAt = null): string {
        $code = $code ?? ('BETA-' . strtoupper(bin2hex(random_bytes(4))));
        $id   = self::uuid();
        $db->prepare(
            'INSERT INTO beta_codes (id, code, expires_at) VALUES (?, ?, ?)'
        )->execute([$id, strtoupper($code), $expiresAt]);
        return $code;
    }

    private static function uuid(): string {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff),
            mt_rand(0,0x0fff)|0x4000, mt_rand(0,0x3fff)|0x8000,
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff));
    }
}
