<?php
namespace BF;

/**
 * Wrapper minimal de OpenAI sin composer ni guzzle.
 * Usa cURL nativo de PHP. Funciona sin clave (devuelve null).
 */
class Ai {
    private const CHAT_URL       = 'https://api.openai.com/v1/chat/completions';
    private const MODERATION_URL = 'https://api.openai.com/v1/moderations';
    private const TIMEOUT_SEC    = 15;

    public static function isEnabled(): bool {
        return defined('OPENAI_API_KEY') && OPENAI_API_KEY !== '';
    }

    // ─── Completion: chat con un prompt simple ──────────────────────────────
    // Devuelve string con la respuesta o null si falla / IA deshabilitada.
    public static function complete(string $systemPrompt, string $userPrompt, string $model = 'gpt-4o-mini'): ?string {
        if (!self::isEnabled()) return null;

        $body = [
            'model'       => $model,
            'temperature' => 0.85,
            'max_tokens'  => 200,
            'messages'    => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user',   'content' => $userPrompt],
            ],
        ];

        $resp = self::request(self::CHAT_URL, $body);
        if (!$resp) return null;

        $text = $resp['choices'][0]['message']['content'] ?? null;
        return is_string($text) ? trim($text) : null;
    }

    // ─── Moderation: chequea si un texto es inapropiado ─────────────────────
    // Devuelve ['flagged' => bool, 'categories' => [..]] o null si falla
    public static function moderate(string $text): ?array {
        if (!self::isEnabled()) return ['flagged' => false, 'categories' => []];

        $resp = self::request(self::MODERATION_URL, [
            'model' => 'omni-moderation-latest',
            'input' => $text,
        ]);
        if (!$resp || empty($resp['results'][0])) return null;

        $r = $resp['results'][0];
        return [
            'flagged'    => (bool)($r['flagged'] ?? false),
            'categories' => $r['categories'] ?? [],
            'scores'     => $r['category_scores'] ?? [],
        ];
    }

    // ─── HTTP POST con cURL ─────────────────────────────────────────────────
    private static function request(string $url, array $body): ?array {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::TIMEOUT_SEC,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . OPENAI_API_KEY,
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
}
