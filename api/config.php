<?php
define('APP_ENV', 'production');
define('FRONTEND_URL', 'https://darkseagreen-skunk-610863.hostingersite.com');

define('DB_HOST', 'localhost');
define('DB_PORT', '3306');
define('DB_NAME', 'u983490684_zafira');
define('DB_USER', 'u983490684_zafira');
define('DB_PASS', 'Juan3228531047@');

define('JWT_SECRET',         'bf_jwt_u983490684_zafira_2026_secret_key_x9k2');
define('JWT_REFRESH_SECRET', 'bf_ref_u983490684_zafira_2026_refresh_key_p3m7');
define('JWT_TTL',            15 * 60);
define('JWT_REFRESH_TTL',    7 * 24 * 3600);

define('STRIPE_SECRET_KEY',     '');
define('STRIPE_WEBHOOK_SECRET', '');
define('STRIPE_PRICE_ID',       '');

// IA: pon UNA de las dos. Groq es gratis y rápido (https://console.groq.com/keys)
define('GROQ_API_KEY',   '');
define('OPENAI_API_KEY', '');

define('LLAMAS_INITIAL_BALANCE', 100);
define('PLAYER_TIMEOUT_SECONDS', 30);
