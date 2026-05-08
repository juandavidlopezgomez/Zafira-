<?php
namespace BF;

/**
 * Wrapper de IA multi-proveedor (sin composer, solo cURL nativo).
 * Prioridad: Groq (gratis, rápido) > OpenAI > fallback null.
 *
 * Configuración en api/config.php:
 *   define('GROQ_API_KEY', 'gsk_...');     // Recomendado (gratuito)
 *   define('OPENAI_API_KEY', 'sk-...');     // Opcional
 *
 * Groq: https://console.groq.com/keys (gratis, 30 req/min, 14k req/día)
 */
class Ai {
    private const TIMEOUT_SEC = 15;

    private const PROVIDERS = [
        'groq' => [
            'chat'       => 'https://api.groq.com/openai/v1/chat/completions',
            'moderation' => null,
            'model'      => 'llama-3.1-8b-instant',
        ],
        'openai' => [
            'chat'       => 'https://api.openai.com/v1/chat/completions',
            'moderation' => 'https://api.openai.com/v1/moderations',
            'model'      => 'gpt-4o-mini',
        ],
    ];

    public static function isEnabled(): bool {
        return self::activeProvider() !== null;
    }

    // ─── Devuelve 'groq' | 'openai' | null según qué clave esté configurada ──
    public static function activeProvider(): ?string {
        if (defined('GROQ_API_KEY')   && GROQ_API_KEY   !== '') return 'groq';
        if (defined('OPENAI_API_KEY') && OPENAI_API_KEY !== '') return 'openai';
        return null;
    }

    // ─── Completion: chat con un prompt simple ──────────────────────────────
    public static function complete(string $systemPrompt, string $userPrompt, ?string $model = null): ?string {
        $provider = self::activeProvider();
        if (!$provider) return null;

        $cfg = self::PROVIDERS[$provider];
        $body = [
            'model'       => $model ?? $cfg['model'],
            'temperature' => 0.85,
            'max_tokens'  => 200,
            'messages'    => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user',   'content' => $userPrompt],
            ],
        ];

        $resp = self::request($cfg['chat'], $body, self::keyFor($provider));
        if (!$resp) return null;

        $text = $resp['choices'][0]['message']['content'] ?? null;
        return is_string($text) ? trim($text) : null;
    }

    // ─── Moderation ─────────────────────────────────────────────────────────
    // OpenAI tiene endpoint dedicado. Groq no, así que usamos prompt-based check.
    public static function moderate(string $text): ?array {
        $provider = self::activeProvider();
        if (!$provider) return ['flagged' => false, 'categories' => []];

        // OpenAI: endpoint nativo
        if ($provider === 'openai') {
            $resp = self::request(self::PROVIDERS['openai']['moderation'], [
                'model' => 'omni-moderation-latest',
                'input' => $text,
            ], self::keyFor('openai'));
            if (!$resp || empty($resp['results'][0])) return null;
            $r = $resp['results'][0];
            return [
                'flagged'    => (bool)($r['flagged'] ?? false),
                'categories' => $r['categories'] ?? [],
                'scores'     => $r['category_scores'] ?? [],
            ];
        }

        // Groq: clasificador con prompt
        $check = self::complete(
            'Eres un moderador. Responde SOLO con "OK" o "FLAG: <razón corta>". '
          . 'FLAG si el texto contiene insultos graves, contenido sexual explícito a menores, '
          . 'doxing, amenazas, discurso de odio o autolesiones. '
          . 'OK para todo lo demás (incluido coqueteo adulto consensuado y bromas).',
            $text
        );
        $flagged = $check && stripos($check, 'FLAG') === 0;
        return [
            'flagged'    => $flagged,
            'categories' => $flagged ? ['custom' => true] : [],
            'reason'     => $flagged ? trim(substr($check ?? '', 5)) : null,
        ];
    }

    // ─── HTTP POST con cURL ─────────────────────────────────────────────────
    private static function request(string $url, array $body, string $apiKey): ?array {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::TIMEOUT_SEC,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $apiKey,
                'Content-Type: application/json',
            ],
        ]);

        $raw  = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($raw === false || $code >= 400) return null;
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    private static function keyFor(string $provider): string {
        return match ($provider) {
            'groq'   => GROQ_API_KEY,
            'openai' => OPENAI_API_KEY,
            default  => '',
        };
    }
}
