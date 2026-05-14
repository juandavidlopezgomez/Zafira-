<?php
namespace BF\Controllers;

use BF\{Database, Auth, Response, Premium, Llamas};

class PaymentsController {

    // POST /payments/create-subscription
    // Body: { successUrl?, cancelUrl? }
    public static function createSubscription(): void {
        $payload = Auth::requireUser();
        $userId  = $payload['sub'];
        $db      = Database::get();

        if (!defined('STRIPE_SECRET_KEY') || !STRIPE_SECRET_KEY) {
            Response::error('Stripe no configurado. Contacta al administrador.', 503);
        }

        // Si ya es Premium activo, no crear nueva sesión
        if (Premium::isActive($db, $userId)) {
            Response::ok(['message' => 'Ya tienes Premium activo', 'alreadyPremium' => true]);
        }

        $body       = json_decode(file_get_contents('php://input'), true) ?? [];
        $base       = defined('FRONTEND_URL') ? FRONTEND_URL : 'http://localhost:5173';
        $successUrl = $body['successUrl'] ?? $base . '/?premium=success';
        $cancelUrl  = $body['cancelUrl']  ?? $base . '/?premium=cancel';

        // Obtener o crear Stripe customer
        $stmt = $db->prepare('SELECT email, username, stripe_customer_id FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        $customerId = $user['stripe_customer_id'] ?? null;
        if (!$customerId) {
            $customerId = self::stripeRequest('POST', '/customers', [
                'email' => $user['email'],
                'name'  => $user['username'],
                'metadata' => ['user_id' => $userId],
            ])['id'] ?? null;

            if ($customerId) {
                Premium::linkCustomer($db, $userId, $customerId);
            }
        }

        // Crear Checkout Session
        $params = [
            'mode'               => 'subscription',
            'customer'           => $customerId,
            'success_url'        => $successUrl . '&session_id={CHECKOUT_SESSION_ID}',
            'cancel_url'         => $cancelUrl,
            'line_items[0][price]'    => defined('STRIPE_PRICE_ID') ? STRIPE_PRICE_ID : '',
            'line_items[0][quantity]' => 1,
            'metadata[user_id]'  => $userId,
            'subscription_data[metadata][user_id]' => $userId,
        ];

        $session = self::stripeRequest('POST', '/checkout/sessions', $params);

        if (empty($session['url'])) {
            Response::error('Error al crear sesión de pago: ' . ($session['error']['message'] ?? 'desconocido'), 502);
        }

        Response::ok(['checkoutUrl' => $session['url'], 'sessionId' => $session['id']]);
    }

    // GET /payments/status
    public static function status(): void {
        $payload = Auth::requireUser();
        $db      = Database::get();
        Response::ok(Premium::status($db, $payload['sub']));
    }

    // POST /payments/cancel
    public static function cancel(): void {
        $payload = Auth::requireUser();
        $userId  = $payload['sub'];
        $db      = Database::get();

        $stmt = $db->prepare(
            "SELECT stripe_subscription_id FROM premium_subscriptions
             WHERE user_id = ? AND status = 'active' LIMIT 1"
        );
        $stmt->execute([$userId]);
        $subId = $stmt->fetchColumn();

        if (!$subId) Response::error('No tienes una suscripción activa', 404);

        // Cancelar al final del período en Stripe
        $result = self::stripeRequest('DELETE', "/subscriptions/{$subId}", [
            'cancel_at_period_end' => 'true',
        ]);

        if (!empty($result['error'])) {
            Response::error('Error al cancelar: ' . $result['error']['message'], 502);
        }

        Response::ok(['message' => 'Suscripción cancelada al final del período', 'cancelAtPeriodEnd' => true]);
    }

    // POST /payments/webhook  (sin Auth — Stripe firma el payload)
    public static function webhook(): void {
        $raw       = file_get_contents('php://input');
        $sigHeader = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';
        $secret    = defined('STRIPE_WEBHOOK_SECRET') ? STRIPE_WEBHOOK_SECRET : '';

        // Verificar firma Stripe
        if ($secret && !self::verifyStripeSignature($raw, $sigHeader, $secret)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid signature']);
            exit;
        }

        $event = json_decode($raw, true);
        if (!$event) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid JSON']);
            exit;
        }

        $db   = Database::get();
        $type = $event['type'] ?? '';
        $obj  = $event['data']['object'] ?? [];

        switch ($type) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                $userId = $obj['metadata']['user_id']
                    ?? Premium::findByCustomer($db, $obj['customer'] ?? '');
                if ($userId && ($obj['status'] ?? '') === 'active') {
                    Premium::activate($db, $userId, $obj['id'], (int)$obj['current_period_end']);
                }
                break;

            case 'customer.subscription.deleted':
                $userId = $obj['metadata']['user_id']
                    ?? Premium::findByCustomer($db, $obj['customer'] ?? '');
                if ($userId) {
                    Premium::deactivate($db, $userId);
                }
                break;

            case 'invoice.payment_failed':
                $customerId = $obj['customer'] ?? '';
                $userId     = Premium::findByCustomer($db, $customerId);
                if ($userId) {
                    Premium::setGracePeriod($db, $userId);
                }
                break;

            case 'invoice.payment_succeeded':
                $customerId = $obj['customer'] ?? '';
                $userId     = Premium::findByCustomer($db, $customerId);
                $subId      = $obj['subscription'] ?? null;
                if ($userId && $subId) {
                    // Renovación exitosa — extender período
                    $sub = self::stripeRequest('GET', "/subscriptions/{$subId}", []);
                    if (!empty($sub['current_period_end'])) {
                        Premium::activate($db, $userId, $subId, (int)$sub['current_period_end']);
                    }
                }
                break;
        }

        http_response_code(200);
        echo json_encode(['received' => true]);
        exit;
    }

    // ─── Stripe HTTP helper (cURL) ───────────────────────────────────────────
    private static function stripeRequest(string $method, string $path, array $params): array {
        $key = defined('STRIPE_SECRET_KEY') ? STRIPE_SECRET_KEY : '';
        $url = 'https://api.stripe.com/v1' . $path;

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_USERPWD, $key . ':');
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);

        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
        } elseif ($method === 'DELETE') {
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'DELETE');
            if ($params) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
            }
        } elseif ($method === 'GET' && $params) {
            curl_setopt($ch, CURLOPT_URL, $url . '?' . http_build_query($params));
        }

        $body = curl_exec($ch);
        curl_close($ch);
        return json_decode($body ?: '{}', true) ?? [];
    }

    // ─── Verificar firma Stripe Webhook ──────────────────────────────────────
    private static function verifyStripeSignature(string $payload, string $sigHeader, string $secret): bool {
        if (!$sigHeader) return false;
        $parts = [];
        foreach (explode(',', $sigHeader) as $part) {
            [$k, $v] = array_pad(explode('=', $part, 2), 2, '');
            $parts[$k] = $v;
        }
        $ts        = (int)($parts['t'] ?? 0);
        $v1        = $parts['v1'] ?? '';
        $signed    = $ts . '.' . $payload;
        $expected  = hash_hmac('sha256', $signed, $secret);
        // Tolerancia de 5 minutos
        return hash_equals($expected, $v1) && abs(time() - $ts) < 300;
    }
}
