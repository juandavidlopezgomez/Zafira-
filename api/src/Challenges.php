<?php
namespace BF;

use PDO;

/**
 * Pool de retos con fallback a OpenAI (regla #3).
 * - getChallenge(): busca en BD; si hay >= 3 disponibles, devuelve uno aleatorio
 * - Si hay menos de 3, llama a Ai::complete() y guarda el reto en pool para reusar
 */
class Challenges {
    public const TYPE_TRUTH  = 'truth';
    public const TYPE_DARE   = 'dare';
    public const TYPE_BATTLE = 'battle';
    public const TYPE_DARK   = 'dark';   // 18+ premium

    private const MIN_POOL_SIZE = 3;

    // ─── Obtener reto por contexto ──────────────────────────────────────────
    // type: truth|dare|battle|dark
    // intensity: 1-5
    // tags: array de strings (ej: ['pareja', 'amistad'])
    // forUserId: para chequear premium / age cuando aplique
    public static function getChallenge(
        PDO $db,
        string $type,
        int $intensity = 2,
        array $tags = [],
        ?string $forUserId = null
    ): ?array {
        // 1. Validar acceso a dark_challenges (Premium + 18+)
        if ($type === self::TYPE_DARK) {
            if (!self::userCanAccessDark($db, $forUserId)) {
                return null;
            }
            return self::darkChallenge($db, $intensity);
        }

        // 2. Buscar en pool
        $stmt = $db->prepare(
            'SELECT * FROM challenges
             WHERE type = ? AND intensity = ? AND active = 1
             ORDER BY uses_count ASC, RAND()
             LIMIT 10'
        );
        $stmt->execute([$type, $intensity]);
        $pool = $stmt->fetchAll();

        // Filtrar por tags si se proveen
        if ($tags) {
            $pool = array_filter($pool, function ($c) use ($tags) {
                $cTags = array_map('trim', explode(',', $c['tags'] ?? ''));
                return count(array_intersect($tags, $cTags)) > 0;
            });
        }

        // 3. Si pool suficiente: elegir uno aleatorio + incrementar uses_count
        if (count($pool) >= self::MIN_POOL_SIZE) {
            $pick = $pool[array_rand($pool)];
            $db->prepare('UPDATE challenges SET uses_count = uses_count + 1 WHERE id = ?')
               ->execute([$pick['id']]);
            return self::format($pick);
        }

        // 4. Fallback IA: generar reto y guardarlo en pool
        $aiText = self::generateWithAi($type, $intensity, $tags);
        if ($aiText) {
            $id = self::insertChallenge($db, $type, $intensity, $tags, $aiText, 'ai');
            return [
                'id'        => $id,
                'type'      => $type,
                'intensity' => $intensity,
                'text'      => $aiText,
                'tags'      => $tags,
                'source'    => 'ai',
            ];
        }

        // 5. Si tampoco hay IA, devolver lo que sea del pool (incluso si < 3)
        if ($pool) {
            $pick = array_values($pool)[array_rand(array_values($pool))];
            return self::format($pick);
        }

        // 6. Último fallback: reto genérico hardcoded
        return self::genericFallback($type, $intensity);
    }

    // ─── Listar pool (admin/debug) ──────────────────────────────────────────
    public static function listPool(PDO $db, ?string $type = null): array {
        if ($type) {
            $stmt = $db->prepare('SELECT * FROM challenges WHERE type = ? ORDER BY created_at DESC LIMIT 200');
            $stmt->execute([$type]);
        } else {
            $stmt = $db->query('SELECT * FROM challenges ORDER BY created_at DESC LIMIT 200');
        }
        return array_map([self::class, 'format'], $stmt->fetchAll());
    }

    // ─── Insertar reto manual (admin) ───────────────────────────────────────
    public static function insertChallenge(
        PDO $db, string $type, int $intensity, array $tags, string $text, string $source = 'manual'
    ): string {
        $id = self::uuid();
        $db->prepare(
            'INSERT INTO challenges (id, type, intensity, tags, text, source) VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$id, $type, $intensity, implode(',', $tags), $text, $source]);
        return $id;
    }

    // ─── Sembrar pool inicial con retos básicos (idempotente) ───────────────
    public static function seedDefaults(PDO $db): int {
        $count = (int) $db->query('SELECT COUNT(*) FROM challenges')->fetchColumn();
        if ($count >= 30) return 0;

        $seeds = self::defaultSeeds();
        $inserted = 0;
        foreach ($seeds as $s) {
            // Evitar duplicados por texto
            $exists = $db->prepare('SELECT 1 FROM challenges WHERE text = ? LIMIT 1');
            $exists->execute([$s['text']]);
            if ($exists->fetch()) continue;

            self::insertChallenge($db, $s['type'], $s['intensity'], $s['tags'], $s['text'], 'manual');
            $inserted++;
        }
        return $inserted;
    }

    // ─── Privados ───────────────────────────────────────────────────────────

    private static function darkChallenge(PDO $db, int $intensity): ?array {
        $stmt = $db->prepare(
            'SELECT * FROM dark_challenges
             WHERE intensity = ? AND active = 1
             ORDER BY RAND() LIMIT 1'
        );
        $stmt->execute([$intensity]);
        $r = $stmt->fetch();
        if (!$r) return null;
        return [
            'id'        => $r['id'],
            'type'      => self::TYPE_DARK,
            'intensity' => (int)$r['intensity'],
            'text'      => $r['text'],
            'tags'      => $r['tags'] ? explode(',', $r['tags']) : [],
            'source'    => 'dark_pool',
        ];
    }

    private static function userCanAccessDark(PDO $db, ?string $userId): bool {
        if (!$userId) return false;
        $stmt = $db->prepare('SELECT is_premium, age_verified FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $u = $stmt->fetch();
        if (!$u) return false;
        return (bool)$u['is_premium'] && (bool)$u['age_verified'];
    }

    private static function generateWithAi(string $type, int $intensity, array $tags): ?string {
        if (!Ai::isEnabled()) return null;

        $tagsText = $tags ? ' Tags: ' . implode(', ', $tags) . '.' : '';
        $system = 'Eres un generador de retos para un juego social entre jóvenes adultos en español. '
                . 'Devuelve SOLO el texto del reto, sin numeración, comillas ni explicaciones. '
                . 'Mantén un tono divertido y respetuoso. Máximo 2 frases.';
        $user = match ($type) {
            self::TYPE_TRUTH  => "Genera una pregunta de 'verdad' con intensidad {$intensity}/5.{$tagsText}",
            self::TYPE_DARE   => "Genera un 'reto' físico o de acción con intensidad {$intensity}/5.{$tagsText}",
            self::TYPE_BATTLE => "Genera una pregunta para enfrentar a 2 jugadores en un duelo, intensidad {$intensity}/5.{$tagsText}",
            default           => "Genera un reto de tipo '{$type}' intensidad {$intensity}/5.{$tagsText}",
        };

        return Ai::complete($system, $user);
    }

    private static function genericFallback(string $type, int $intensity): array {
        $generic = match ($type) {
            self::TYPE_TRUTH  => '¿Cuál es el rumor más divertido que has escuchado de ti mismo?',
            self::TYPE_DARE   => 'Imita a otro jugador durante 30 segundos sin parar.',
            self::TYPE_BATTLE => '¿Quién de los dos es más probable que cante en la ducha a todo volumen?',
            default           => 'Cuenta una anécdota vergonzosa de tu adolescencia.',
        };
        return [
            'id'        => 'fallback',
            'type'      => $type,
            'intensity' => $intensity,
            'text'      => $generic,
            'tags'      => [],
            'source'    => 'fallback',
        ];
    }

    private static function format(array $r): array {
        return [
            'id'         => $r['id'],
            'type'       => $r['type'],
            'intensity'  => (int)$r['intensity'],
            'text'       => $r['text'],
            'tags'       => $r['tags'] ? array_map('trim', explode(',', $r['tags'])) : [],
            'source'     => $r['source'] ?? 'manual',
            'uses_count' => (int)($r['uses_count'] ?? 0),
        ];
    }

    private static function uuid(): string {
        return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff),
            mt_rand(0,0x0fff)|0x4000, mt_rand(0,0x3fff)|0x8000,
            mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff));
    }

    // ─── Pool inicial (35 retos curados) ────────────────────────────────────
    private static function defaultSeeds(): array {
        return [
            // Truth — intensidad 1
            ['type' => 'truth', 'intensity' => 1, 'tags' => ['general'], 'text' => '¿Cuál es tu canción guilty pleasure que jamás admitirías en público?'],
            ['type' => 'truth', 'intensity' => 1, 'tags' => ['general'], 'text' => '¿Cuál fue la última mentira blanca que dijiste hoy?'],
            ['type' => 'truth', 'intensity' => 1, 'tags' => ['general'], 'text' => 'Si pudieras borrar un recuerdo, ¿cuál sería?'],
            // Truth — intensidad 2
            ['type' => 'truth', 'intensity' => 2, 'tags' => ['amistad'], 'text' => '¿De qué persona del grupo sabes el secreto más jugoso?'],
            ['type' => 'truth', 'intensity' => 2, 'tags' => ['amistad'], 'text' => '¿Quién del grupo te cae mejor… y por qué exactamente?'],
            ['type' => 'truth', 'intensity' => 2, 'tags' => ['general'], 'text' => '¿Cuál es la cosa más rara que has googleado este año?'],
            // Truth — intensidad 3
            ['type' => 'truth', 'intensity' => 3, 'tags' => ['flirteo'], 'text' => '¿Quién del grupo te parece atractivo aunque no lo dirías abiertamente?'],
            ['type' => 'truth', 'intensity' => 3, 'tags' => ['flirteo'], 'text' => '¿Has tenido alguna vez un crush platónico con alguien aquí?'],
            ['type' => 'truth', 'intensity' => 3, 'tags' => ['amistad'], 'text' => '¿Qué pensaste la primera vez que viste a la persona a tu derecha?'],
            // Truth — intensidad 4 (más intenso)
            ['type' => 'truth', 'intensity' => 4, 'tags' => ['flirteo'], 'text' => 'Describe el coqueteo más arriesgado que has hecho.'],
            ['type' => 'truth', 'intensity' => 4, 'tags' => ['general'], 'text' => '¿Qué harías si supieras que nadie te juzgaría jamás?'],

            // Dare — intensidad 1
            ['type' => 'dare', 'intensity' => 1, 'tags' => ['general'], 'text' => 'Imita a un personaje famoso hasta que el grupo lo adivine.'],
            ['type' => 'dare', 'intensity' => 1, 'tags' => ['general'], 'text' => 'Manda un mensaje de buenas noches al tercer contacto de tu lista.'],
            ['type' => 'dare', 'intensity' => 1, 'tags' => ['general'], 'text' => 'Habla con acento extranjero durante las próximas 3 rondas.'],
            // Dare — intensidad 2
            ['type' => 'dare', 'intensity' => 2, 'tags' => ['social'], 'text' => 'Llama a tu mamá y dile que la quieres sin razón aparente.'],
            ['type' => 'dare', 'intensity' => 2, 'tags' => ['general'], 'text' => 'Improvisa una canción de 30 segundos sobre la persona a tu izquierda.'],
            ['type' => 'dare', 'intensity' => 2, 'tags' => ['general'], 'text' => 'Cuenta tu peor cita en menos de 60 segundos.'],
            // Dare — intensidad 3
            ['type' => 'dare', 'intensity' => 3, 'tags' => ['flirteo'], 'text' => 'Hazle un piropo creativo a la persona del grupo que más miedo te dé.'],
            ['type' => 'dare', 'intensity' => 3, 'tags' => ['flirteo'], 'text' => 'Mira fijamente a otro jugador durante 30 segundos sin reírte.'],
            ['type' => 'dare', 'intensity' => 3, 'tags' => ['social'], 'text' => 'Publica una foto graciosa tuya en tu última story.'],
            // Dare — intensidad 4
            ['type' => 'dare', 'intensity' => 4, 'tags' => ['flirteo'], 'text' => 'Susúrrale algo dulce al oído al jugador que el grupo elija.'],
            ['type' => 'dare', 'intensity' => 4, 'tags' => ['flirteo'], 'text' => 'Sienta a alguien en tu regazo durante el siguiente turno.'],

            // Battle 1v1
            ['type' => 'battle', 'intensity' => 2, 'tags' => ['1v1'], 'text' => '¿Quién es más probable que se enamore primero después de 2 citas?'],
            ['type' => 'battle', 'intensity' => 2, 'tags' => ['1v1'], 'text' => '¿Quién tiene mejor ojo para detectar mentiras?'],
            ['type' => 'battle', 'intensity' => 3, 'tags' => ['1v1'], 'text' => '¿Quién es más atrevido cuando le gusta alguien?'],
            ['type' => 'battle', 'intensity' => 3, 'tags' => ['1v1'], 'text' => '¿Quién se sale con la suya más fácilmente con una sonrisa?'],
            ['type' => 'battle', 'intensity' => 4, 'tags' => ['1v1'], 'text' => '¿Quién daría el primer beso sin avisar?'],
            ['type' => 'battle', 'intensity' => 4, 'tags' => ['1v1'], 'text' => '¿Quién es más probable que rompa una regla por amor?'],
        ];
    }
}
