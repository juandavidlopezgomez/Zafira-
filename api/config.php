<?php
// ─── Configuración BattleFlirt ────────────────────────────────────────────────
// Copia este archivo a config.php y completa con tus datos de Hostinger.
// NUNCA subas este archivo con datos reales a git (está en .gitignore).

define('APP_ENV', getenv('APP_ENV') ?: 'production');
define('FRONTEND_URL', getenv('FRONTEND_URL') ?: 'https://tudominio.com');

// MySQL — Panel Hostinger > Bases de datos > MySQL
define('DB_HOST',     getenv('DB_HOST')     ?: 'localhost');
define('DB_PORT',     getenv('DB_PORT')     ?: '3306');
define('DB_NAME',     getenv('DB_NAME')     ?: 'tuusuario_battleflirt');
define('DB_USER',     getenv('DB_USER')     ?: 'tuusuario_db');
define('DB_PASS',     getenv('DB_PASS')     ?: 'tu_password_db');

// JWT — genera con: php -r "echo bin2hex(random_bytes(32));"
define('JWT_SECRET',         getenv('JWT_SECRET')         ?: 'CAMBIA_ESTO_clave_segura_minimo_32_chars');
define('JWT_REFRESH_SECRET', getenv('JWT_REFRESH_SECRET') ?: 'CAMBIA_ESTO_otra_clave_segura_32_chars__');
define('JWT_TTL',            15 * 60);       // 15 minutos (access token)
define('JWT_REFRESH_TTL',    7 * 24 * 3600); // 7 días (refresh token)

// Stripe
define('STRIPE_SECRET_KEY',      getenv('STRIPE_SECRET_KEY')      ?: '');
define('STRIPE_WEBHOOK_SECRET',  getenv('STRIPE_WEBHOOK_SECRET')  ?: '');
define('STRIPE_PRICE_ID',        getenv('STRIPE_PRICE_ID')        ?: '');

// OpenAI
define('OPENAI_API_KEY', getenv('OPENAI_API_KEY') ?: '');

// LLAMAS
define('LLAMAS_INITIAL_BALANCE', 100);

// Polling: tiempo máximo que un jugador puede estar inactivo (segundos)
define('PLAYER_TIMEOUT_SECONDS', 30);
