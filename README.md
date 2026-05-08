# BattleFlirt (Zafira)

Plataforma social de juegos multijugador con modos de coqueteo, retos y arena. **Backend PHP + MySQL** + **Frontend React/Vite**, desplegable en hosting compartido (Hostinger).

---

## 1. Stack técnico

| Capa | Tecnología |
|------|------------|
| Frontend | React 18 + Vite + TypeScript + TailwindCSS + Zustand |
| Backend | PHP 8.x (sin frameworks, sin composer) |
| Base de datos | MySQL / MariaDB (12 tablas) |
| Tiempo real | HTTP polling cada 2s (no WebSockets — incompatible con shared hosting) |
| Auth | JWT HS256 (access 15min + refresh 7d) — implementación manual |
| Deploy | Apache + `.htaccess` + git pull |

---

## 2. Estructura del repo (rama `deploy`)

```
/
├── .htaccess              # Apache: SPA + /api → backend PHP
├── index.html             # React app compilado
├── assets/                # JS/CSS compilados de Vite
├── api/
│   ├── .htaccess          # Routing → index.php
│   ├── index.php          # Router PHP (match expression)
│   ├── config.php         # Credenciales BD + JWT secrets
│   └── src/
│       ├── Database.php   # PDO singleton
│       ├── JWT.php        # encode/decode HS256 manual
│       ├── Auth.php       # requireUser / makeTokens
│       ├── Response.php   # ok() / error() / json()
│       └── controllers/
│           ├── AuthController.php
│           ├── RoomsController.php
│           ├── GameController.php
│           ├── LlamasController.php
│           ├── HiloController.php
│           └── ArenaController.php
└── database/
    └── schema.sql         # 12 tablas MySQL/MariaDB
```

---

## 3. Base de datos (12 tablas)

| Tabla | Función |
|-------|---------|
| `users` | Usuarios, password_hash bcrypt, charisma_pts, referral_code |
| `rooms` | Salas de juego con código de 8 chars, host, modo, status |
| `room_players` | Jugadores activos por sala (reemplaza Redis hset) |
| `game_state` | Estado transitorio key-value por sala (reemplaza Redis) |
| `game_events` | Cola de eventos para polling (auto-incremento `id`) |
| `llamas_transactions` | Movimientos de la moneda interna "LLAMAS" |
| `premium_subscriptions` | Suscripciones Stripe (opcional) |
| `arena_stadiums` | Sesiones de arena (votaciones globales) |
| `arena_events` | Eventos de arena |
| `arena_votes` | Votos individuales en arena |
| `hilo_messages` | Chat anónimo "Hilo" con secuencia |
| `hilo_reactions` | Reacciones emoji a mensajes |

Crear todas via: `GET /api/install` (lee `database/schema.sql` y ejecuta).

---

## 4. Endpoints REST

### Diagnóstico
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Versión PHP, conexión BD, tablas existentes |
| GET | `/api/install` | Crea las 12 tablas desde `schema.sql` |

### Auth
| Método | Ruta | Body | Devuelve |
|--------|------|------|----------|
| POST | `/api/auth/register` | `{username, email, password}` | `{accessToken, refreshToken, user}` |
| POST | `/api/auth/login` | `{email, password}` | igual que register |
| POST | `/api/auth/refresh` | `{refreshToken}` | nuevos tokens |
| GET | `/api/auth/me` | header `Authorization: Bearer <token>` | datos del usuario |

Reglas:
- Email único, username único
- Password mínimo 8 caracteres
- Al registrarse: +100 LLAMAS de bienvenida
- referral_code generado: `REF-` + 6 chars del UUID

### Rooms
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/rooms` | Crear sala. Body `{mode, maxPlayers?, isPremium?}` |
| GET | `/api/rooms/:code` | Buscar sala por código de 8 chars |
| POST | `/api/rooms/:id/join` | Unirse a la sala |
| POST | `/api/rooms/:id/leave` | Salir de la sala |
| GET | `/api/rooms/:id/players` | Lista jugadores activos |
| GET | `/api/rooms/:id/state` | Estado completo de la sala |

Modos válidos: `truth_dare`, `bottle`, `cartas`, `oscuro`, `juicio`, `actores`, `liga`, `termometro`, `todo_nada`, `ultimo_pie`, `battle_1v1`.

### Game (acciones genéricas)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/game/:roomId/action` | Body `{event, payload}` — emite evento al backend |
| GET | `/api/game/:roomId/events?since=:id` | **Polling** — eventos nuevos desde `id` |

El frontend hace polling cada **2 segundos** a `/events?since=`. Cada evento tiene `id` autoincrementado, `event_type`, `payload` (JSON).

### LLAMAS (moneda)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/llamas/balance` | Balance actual del usuario |
| GET | `/api/llamas/history` | Historial paginado de transacciones |

### Hilo (chat anónimo)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/hilo/:roomId/messages?since=:seq` | Mensajes nuevos por seq |
| POST | `/api/hilo/:roomId/messages` | Body `{content, anonymous?}` |
| POST | `/api/hilo/:roomId/react` | Body `{messageId, reaction}` |

### Arena (votación global)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/arena/:roomId/start` | Iniciar feature de arena |
| POST | `/api/arena/:roomId/vote` | Votar `{targetId, voteType}` |
| GET | `/api/arena/:roomId/results` | Resultados de votación |
| POST | `/api/arena/:roomId/end` | Cerrar arena |
| GET | `/api/arena/ruleta` | Spin de ruleta aleatoria |

---

## 5. Modos de juego

| Modo | Componente | Mecánica |
|------|------------|----------|
| **Truth or Dare** | `TruthDareGame` | Verdad o reto clásico, turnos rotando |
| **Botella** | `BottleGame` | Botella gira, elige víctima |
| **Cartas** | `CartasGame` | Cartas de retos eróticos progresivos |
| **Oscuro** | `OscuroGame` | Modo anónimo, secretos confesionales |
| **Juicio** | `JuicioGame` | Acusan a alguien, jurado vota culpable/inocente |
| **Actores** | `ActoresGame` | Roleplay con personajes asignados |
| **Liga** | `LigaGame` | Torneo de coqueteo por puntos |
| **Termómetro** | `TermometroGame` | Sube tensión grupal con preguntas |
| **Todo o Nada** | `TodoNadaGame` | Apuesta LLAMAS por reto extremo |
| **Último en Pie** | `UltimoPieGame` | Eliminatoria con votos negativos |
| **Battle 1v1** | `Battle1v1Game` | Duelo de carisma cara a cara |

---

## 6. Flujo de juego (resumen)

1. **Login/Register** → recibe `accessToken` (válido 15min)
2. **Lobby** → crear sala (host) o unirse con código
3. **GameRoom** → host selecciona modo → backend emite `game:started`
4. Frontend hace **polling cada 2s** a `/api/game/:roomId/events?since={lastId}`
5. Cada acción (turno, voto, reacción) → POST a `/api/game/:roomId/action`
6. El backend escribe en `game_events`, todos los clientes reciben en su próximo poll
7. Estado persistente del juego en `game_state` (key-value)
8. Recompensas LLAMAS al ganar → fila en `llamas_transactions`

---

## 7. Configuración (`api/config.php`)

```php
define('APP_ENV', 'production');
define('FRONTEND_URL', 'https://tu-dominio.com');

define('DB_HOST', 'localhost');
define('DB_PORT', '3306');
define('DB_NAME', 'tu_base_datos');
define('DB_USER', 'tu_usuario');
define('DB_PASS', 'tu_password');

define('JWT_SECRET',         'cambia-esto-en-prod');
define('JWT_REFRESH_SECRET', 'cambia-esto-tambien');
define('JWT_TTL',            15 * 60);          // 15 minutos
define('JWT_REFRESH_TTL',    7 * 24 * 3600);    // 7 días

define('STRIPE_SECRET_KEY',     '');  // opcional
define('STRIPE_WEBHOOK_SECRET', '');
define('STRIPE_PRICE_ID',       '');
define('OPENAI_API_KEY',        '');  // opcional para IA en juegos

define('LLAMAS_INITIAL_BALANCE', 100);
define('PLAYER_TIMEOUT_SECONDS', 30);
```

---

## 8. Despliegue en Hostinger

1. **Crear BD MySQL** en panel Hostinger → anotar host, nombre, usuario, password
2. **Editar `api/config.php`** con esas credenciales y el dominio
3. **Subir repo** a `public_html/`:
   - Avanzado → Git → Repo URL: `https://github.com/juandavidlopezgomez/Zafira-.git`
   - Branch: `deploy`
   - Path: `public_html`
4. **Deploy ahora** (jala los archivos)
5. **Inicializar BD** abriendo: `https://tu-dominio.com/api/install`
6. Verificar: `https://tu-dominio.com/api/health` debe mostrar 12 tablas

---

## 9. Decisiones técnicas clave

- **Sin Node.js**: Hostinger compartido solo tiene PHP/Apache/MySQL
- **Sin WebSockets**: imposible en shared hosting → polling HTTP cada 2s
- **Sin Composer**: JWT implementado manualmente (`api/src/JWT.php`), PDO viene con PHP
- **Sin Redis**: tabla `game_state` reemplaza key-value, `game_events` reemplaza pub/sub
- **Frontend pre-compilado**: la rama `deploy` ya trae `index.html` + `assets/` listos
- **CORS**: configurado en `index.php` por `FRONTEND_URL`

---

## 10. Troubleshooting

| Síntoma | Causa | Solución |
|---------|-------|----------|
| 500 en `/api/auth/register` | Tablas no creadas | `GET /api/install` |
| `db: fail: Access denied` | Credenciales malas en `config.php` | Edita `api/config.php` |
| `tables: []` | BD vacía | `GET /api/install` |
| 404 en todas las rutas API | `.htaccess` no se aplica | Activar `AllowOverride All` |
| CORS error en navegador | `FRONTEND_URL` no coincide | Ajustar en `config.php` |
| 500 silencioso | Error PHP no visible | El handler en `index.php` ya devuelve JSON |

---

## 11. Comandos útiles

```bash
# Ver logs de error PHP en Hostinger
tail -f ~/logs/error_log

# Resetear BD (cuidado!)
DROP DATABASE u983490684_zafira; CREATE DATABASE u983490684_zafira;
# luego: GET /api/install
```
