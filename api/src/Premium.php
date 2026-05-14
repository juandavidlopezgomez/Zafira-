<?php
namespace BF;

use PDO;

/**
 * Premium: suscripción $4.99/mes vía Stripe.
 * - Grace period 3 días tras fallo de pago (regla #5)
 * - Verificación siempre server-side, nunca en cliente
 */
class Premium {
    public const PRICE_MONTHLY = 499; // centavos USD
    public const GRACE_DAYS    = 3;

    // ─── Verificar si usuario tiene Premium activo ───────────────────────────
    public static function isActive(PDO $db, string $userId): bool {
        $stmt = $db->prepare(
            'SELECT is_premium, premium_expires_at, grace_period_ends_at
             FROM users WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$userId]);
        $u = $stmt->fetch();
        if (!$u) return false;

        if ($u['is_premium']) {
            // Verificar expiración
            if ($u['premium_expires_at'] && strtotime($u['premium_expires_at']) < time()) {
                // Expiró — verificar grace period
                if ($u['grace_period_ends_at'] && strtotime($u['grace_period_ends_at']) >= time()) {
                    return true; // en grace period
                }
                // Grace expiró: revocar
                self::deactivate($db, $userId);
                return false;
            }
            return true;
        }
        return false;
    }

    // ─── Activar Premium (tras pago exitoso) ─────────────────────────────────
    public static function activate(PDO $db, string $userId, string $stripeSubId, int $periodEnd): void {
        $db->prepare(
            "UPDATE users
             SET is_premium = 1,
                 premium_expires_at  = FROM_UNIXTIME(?),
                 grace_period_ends_at = NULL
             WHERE id = ?"
        )->execute([$periodEnd, $userId]);

        // Guardar en premium_subscriptions (UNIQUE por user_id)
        $id = self::uuid();
        $db->prepare(
            "INSERT INTO premium_subscriptions
             (id, user_id, stripe_subscription_id, status, current_period_end)
             VALUES (?, ?, ?, 'active', FROM_UNIXTIME(?))
             ON DUPLICATE KEY UPDATE
               stripe_subscription_id = VALUES(stripe_subscription_id),
               status = 'active',
               current_period_end = VALUES(current_period_end),
               updated_at = NOW()"
        )->execute([$id, $userId, $stripeSubId, $periodEnd]);

        // Insignia + LLAMAS bienvenida Premium
        Badges::grant($db, $userId, 'premium_member');
        Llamas::credit($db, $userId, 200, 'premium_welcome', null, null);
    }

    // ─── Activar grace period tras fallo de pago ─────────────────────────────
    public static function setGracePeriod(PDO $db, string $userId): void {
        $graceEnd = date('Y-m-d H:i:s', time() + self::GRACE_DAYS * 86400);
        $db->prepare(
            "UPDATE users SET grace_period_ends_at = ? WHERE id = ?"
        )->execute([$graceEnd, $userId]);

        $db->prepare(
            "UPDATE premium_subscriptions SET status = 'past_due'
             WHERE user_id = ? AND status = 'active'"
        )->execute([$userId]);
    }

    // ─── Revocar Premium ─────────────────────────────────────────────────────
    public static function deactivate(PDO $db, string $userId): void {
        $db->prepare(
            "UPDATE users
             SET is_premium = 0, premium_expires_at = NULL, grace_period_ends_at = NULL
             WHERE id = ?"
        )->execute([$userId]);

        $db->prepare(
            "UPDATE premium_subscriptions SET status = 'canceled', updated_at = NOW()
             WHERE user_id = ? AND status IN ('active','past_due')"
        )->execute([$userId]);
    }

    // ─── Encontrar userId por Stripe customer_id ─────────────────────────────
    public static function findByCustomer(PDO $db, string $customerId): ?string {
        $stmt = $db->prepare('SELECT id FROM users WHERE stripe_customer_id = ? LIMIT 1');
        $stmt->execute([$customerId]);
        $id = $stmt->fetchColumn();
        return $id ?: null;
    }

    // ─── Guardar stripe_customer_id en user ──────────────────────────────────
    public static function linkCustomer(PDO $db, string $userId, string $customerId): void {
        $db->prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?')
           ->execute([$customerId, $userId]);
    }

    // ─── Estado de suscripción para el usuario ───────────────────────────────
    public static function status(PDO $db, string $userId): array {
        $stmt = $db->prepare(
            'SELECT u.is_premium, u.premium_expires_at, u.grace_period_ends_at,
                    ps.status as sub_status, ps.stripe_subscription_id, ps.current_period_end
             FROM users u
             LEFT JOIN premium_subscriptions ps ON ps.user_id = u.id AND ps.status != "canceled"
             WHERE u.id = ? LIMIT 1'
        );
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        if (!$row) return ['active' => false];

        $active = self::isActive($db, $userId);
        return [
            'active'         => $active,
            'expiresAt'      => $row['premium_expires_at'],
            'gracePeriodEnd' => $row['grace_period_ends_at'],
            'subStatus'      => $row['sub_status'],
            'subscriptionId' => $row['stripe_subscription_id'],
            'periodEnd'      => $row['current_period_end'],
        ];
    }

    private static function uuid(): string {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff),
            mt_rand(0,0x0fff)|0x4000, mt_rand(0,0x3fff)|0x8000,
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff));
    }
}
