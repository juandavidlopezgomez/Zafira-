# BattleFlirt — Plan de Desarrollo Granular
**Versión:** 2.0 | **Actualizado:** Marzo 2026
**Stack:** React 18 + Vite 5 + TypeScript | NestJS 10 + Socket.io | PostgreSQL + Redis | OpenAI GPT-4o-mini | Stripe | Vercel + Railway → Hostinger VPS

---

## ESTRUCTURA DE CARPETAS DEL PROYECTO

```
battleflirt/
├── frontend/                    ← React 18 + Vite 5 + TypeScript (deploy: Vercel)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/              ← shadcn/ui base components
│   │   │   ├── game/            ← componentes por modo de juego
│   │   │   ├── arena/           ← componentes Arena
│   │   │   └── hilo/            ← componentes El Hilo
│   │   ├── pages/
│   │   ├── hooks/               ← useSocket, useGame, useArena, useHilo
│   │   ├── stores/              ← Zustand stores
│   │   ├── lib/
│   │   │   ├── socket.ts        ← Socket.io client singleton
│   │   │   └── api.ts           ← TanStack Query fetchers
│   │   └── styles/
│   │       └── globals.css      ← TailwindCSS + design tokens dark theme
│   ├── .env.local
│   └── vite.config.ts
│
└── backend/                     ← NestJS 10 + TypeScript (deploy: Railway → Hostinger VPS)
    ├── src/
    │   ├── main.ts
    │   ├── app.module.ts
    │   ├── config/              ← ConfigModule, validación env
    │   ├── auth/                ← AuthModule: JWT, Guards, Strategies
    │   │   ├── auth.module.ts
    │   │   ├── auth.service.ts
    │   │   ├── auth.controller.ts
    │   │   ├── guards/
    │   │   │   ├── jwt-auth.guard.ts
    │   │   │   ├── premium.guard.ts
    │   │   │   └── age-verification.guard.ts
    │   │   └── strategies/
    │   │       └── jwt.strategy.ts
    │   ├── users/               ← UsersModule
    │   │   ├── users.module.ts
    │   │   ├── users.service.ts
    │   │   └── users.controller.ts
    │   ├── rooms/               ← RoomsModule: salas + QR
    │   │   ├── rooms.module.ts
    │   │   ├── rooms.service.ts
    │   │   └── rooms.controller.ts
    │   ├── game/                ← GameModule: lógica de todos los modos
    │   │   ├── game.module.ts
    │   │   ├── game.gateway.ts  ← WebSocket Gateway principal
    │   │   ├── game.service.ts
    │   │   └── modes/           ← un service por modo de juego
    │   │       ├── bottle.service.ts
    │   │       ├── truth-dare.service.ts
    │   │       ├── battle-1v1.service.ts
    │   │       ├── liga.service.ts
    │   │       ├── juicio.service.ts
    │   │       ├── oscuro.service.ts
    │   │       ├── cartas.service.ts
    │   │       ├── termometro.service.ts
    │   │       ├── actores.service.ts
    │   │       ├── ultimo-pie.service.ts
    │   │       └── todo-nada.service.ts
    │   ├── arena/               ← ArenaModule: 9 features
    │   │   ├── arena.module.ts
    │   │   ├── arena.gateway.ts
    │   │   └── arena.service.ts
    │   ├── hilo/                ← HiloModule: chat con tensión
    │   │   ├── hilo.module.ts
    │   │   ├── hilo.gateway.ts
    │   │   └── hilo.service.ts
    │   ├── llamas/              ← LlamasModule: economía virtual
    │   │   ├── llamas.module.ts
    │   │   ├── llamas.service.ts
    │   │   └── llamas.controller.ts
    │   ├── challenges/          ← ChallengesModule: pool de retos + IA
    │   │   ├── challenges.module.ts
    │   │   └── challenges.service.ts
    │   ├── ai/                  ← AiModule: OpenAI wrapper
    │   │   ├── ai.module.ts
    │   │   └── ai.service.ts
    │   ├── payments/            ← PaymentsModule: Stripe
    │   │   ├── payments.module.ts
    │   │   ├── payments.service.ts
    │   │   └── payments.controller.ts
    │   ├── redis/               ← RedisModule: caché global
    │   │   ├── redis.module.ts
    │   │   └── redis.service.ts
    │   └── database/            ← TypeORM entities + migrations
    │       ├── entities/
    │       └── migrations/
    ├── .env
    └── nest-cli.json
```

---

## REGLAS DEL PROYECTO (12 reglas)

1. **Nunca emitir señales de interés durante la partida** — solo se revelan al finalizar si hay match mutuo
2. **Balance LLAMAS siempre derivado del ledger** — nunca actualizar columna `balance` directamente; siempre insertar en `llamas_transactions` y recalcular
3. **Pool de retos primero, IA como fallback** — solo llamar a OpenAI si el pool tiene < 3 retos disponibles para el contexto dado
4. **Reveal-only matches** — el sistema nunca confirma si A le gustó a B hasta que B también marque interés en A
5. **Premium gating enforced server-side** — `PremiumGuard` en todos los endpoints y eventos Socket premium; el frontend es solo UI
6. **Tensión del Hilo vive en Redis primero, BD segundo** — `hilo:{roomId}:tension` en Redis, flush a `hilo_tension_history` cada 5 minutos
7. **Arena requiere mínimo 5 participantes** — validar en gateway antes de iniciar cualquier feature de Arena
8. **Modo Anónimo del Hilo enmascara identidad a nivel de gateway** — el gateway nunca emite `userId` en eventos del Hilo anónimo; emite `aliasId`
9. **TypeScript estricto** — `strict: true` en tsconfig, sin `any` explícito, nunca deshabilitar reglas de ESLint con comentarios inline
10. **Eventos Socket.io namespaced** — formato `{modulo}:{accion}` (ej: `bottle:spin`, `hilo:message`, `arena:vote`)
11. **Moderación en mensajes del Hilo** — todo texto enviado al Hilo pasa por OpenAI Moderation API antes de broadcast
12. **Un módulo = un dominio** — no importar services de otros módulos directamente; usar eventos NestJS (`EventEmitter2`) para comunicación cross-módulo

---

## MES 1 — ARQUITECTURA + DISEÑO

### TAREA 1.1 — Design System: dark theme + colores + shadcn/ui
**Prioridad:** Máxima | **Tiempo estimado:** 1 día

- [ ] Definir paleta: primario `#FF2D55` (rosa-rojo batalla), secundario `#FF6B00` (naranja LLAMAS), fondo `#0A0A0F` (negro profundo), superficie `#12121A`, texto `#F0F0F5`
- [ ] Configurar TailwindCSS con tokens personalizados en `tailwind.config.ts`
- [ ] Instalar shadcn/ui con tema dark por defecto: `npx shadcn-ui@latest init`
- [ ] Crear componentes base: `<Button variant="battle">`, `<Card glow>`, `<Badge llamas>`
- [ ] Instalar Framer Motion: `npm i framer-motion`

```ts
// frontend/tailwind.config.ts
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        battle:  { DEFAULT: '#FF2D55', dark: '#CC2444' },
        llamas:  { DEFAULT: '#FF6B00', dark: '#CC5500' },
        surface: { DEFAULT: '#12121A', light: '#1A1A26' },
        muted:   '#2A2A3A',
      },
      fontFamily: { sans: ['Inter', 'sans-serif'] },
    },
  },
}
```

---

### TAREA 1.2 — Wireframes flujos clave
**Prioridad:** Alta | **Tiempo estimado:** 1 día

Documentar (Figma o papel) los flujos:
- [ ] Flujo de unirse a sala via QR → seleccionar modo → partida → reveal matches
- [ ] Flujo El Hilo: entrar → nivel de tensión → mensaje → reacción → subir nivel
- [ ] Flujo Arena: unirse → votar → ver resultado → siguiente feature
- [ ] Flujo LLAMAS: ganar → gastar → comprar premium → confirmación Stripe
- [ ] Estados vacíos, loading, error para cada pantalla principal

---

### TAREA 1.3 — Schema completo de base de datos (25+ tablas)
**Prioridad:** Máxima | **Tiempo estimado:** 2 días

Ver sección **SCHEMA DE BASE DE DATOS** al final del documento.

- [ ] Validar que todas las foreign keys tienen índices
- [ ] Crear script de migración inicial: `backend/src/database/migrations/001_initial.sql`
- [ ] Verificar que `llamas_transactions` es append-only (sin UPDATE/DELETE via trigger)
- [ ] Añadir extensión `uuid-ossp` en PostgreSQL

---

### TAREA 1.4 — NestJS init + módulos base + TypeORM + Redis
**Prioridad:** Máxima | **Tiempo estimado:** 1 día

```bash
# Crear proyecto
npm i -g @nestjs/cli
nest new battleflirt-backend --strict
cd battleflirt-backend

# Dependencias principales
npm i @nestjs/typeorm typeorm pg
npm i @nestjs/config joi
npm i @nestjs/websockets @nestjs/platform-socket.io socket.io
npm i @nestjs/jwt @nestjs/passport passport passport-jwt
npm i ioredis @nestjs/cache-manager cache-manager-ioredis
npm i @nestjs/event-emitter
npm i stripe openai
npm i bcrypt class-validator class-transformer
npm i -D @types/pg @types/bcrypt @types/passport-jwt
```

```ts
// backend/src/app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    TypeOrmModule.forRootAsync({
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        url: cfg.get('DATABASE_URL'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        synchronize: false,
      }),
      inject: [ConfigService],
    }),
    EventEmitterModule.forRoot(),
    RedisModule,
    AuthModule,
    UsersModule,
    RoomsModule,
    GameModule,
    ArenaModule,
    HiloModule,
    LlamasModule,
    ChallengesModule,
    AiModule,
    PaymentsModule,
  ],
})
export class AppModule {}
```

- [ ] Configurar `RedisModule` con `ioredis` como proveedor global
- [ ] Configurar `ConfigModule` con validación Joi de todas las variables de entorno
- [ ] Crear `.env.example` con todas las variables necesarias
- [ ] Conectar Railway PostgreSQL plugin + Upstash Redis

---

### TAREA 1.5 — Contrato completo de eventos Socket.io
**Prioridad:** Alta | **Tiempo estimado:** 4 horas

Ver sección **CONTRATOS SOCKET.IO** al final del documento.

- [ ] Crear `backend/src/game/game.gateway.ts` con decoradores NestJS
- [ ] Crear tipos TypeScript compartidos en `backend/src/types/events.ts`
- [ ] Documentar todos los eventos emitidos y escuchados por módulo

```ts
// backend/src/game/game.gateway.ts — esqueleto
@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL } })
@UseGuards(WsJwtGuard)
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  handleConnection(client: Socket) { /* auth + join rooms */ }
  handleDisconnect(client: Socket) { /* cleanup Redis state */ }

  @SubscribeMessage('room:join')
  handleRoomJoin(@ConnectedSocket() client: Socket, @MessageBody() dto: JoinRoomDto) {}

  @SubscribeMessage('bottle:spin')
  handleBottleSpin(@ConnectedSocket() client: Socket, @MessageBody() dto: SpinDto) {}
}
```

---

## MES 2 — MVP CORE

### TAREA 2.1 — Autenticación JWT + perfiles de usuario
**Prioridad:** Máxima | **Tiempo estimado:** 1 día

- [ ] Registro con email + contraseña (bcrypt, 12 rounds)
- [ ] Login → JWT access token (15min) + refresh token (7 días) en httpOnly cookie
- [ ] `GET /auth/me` → perfil completo con balance LLAMAS
- [ ] `AgeVerificationGuard`: bloquear acceso a menores de 18 si el modo lo requiere

```ts
// backend/src/auth/auth.service.ts
@Injectable()
export class AuthService {
  async login(dto: LoginDto): Promise<{ access_token: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !await bcrypt.compare(dto.password, user.passwordHash))
      throw new UnauthorizedException('Credenciales inválidas');
    const payload = { sub: user.id, email: user.email, isPremium: user.isPremium };
    return { access_token: this.jwtService.sign(payload) };
  }
}
```

---

### TAREA 2.2 — Salas + sistema QR
**Prioridad:** Máxima | **Tiempo estimado:** 1 día

- [ ] `POST /rooms` → crear sala, devuelve `{ roomId, code, qrUrl }`
- [ ] `GET /rooms/:code/join` → validar código + redirigir a sala
- [ ] QR code: generar URL `https://battleflirt.app/sala/{code}` → codificar con librería `qrcode`
- [ ] Página de scan: detectar QR en móvil con `jsQR` o cámara nativa
- [ ] Deep link: si la app está instalada (PWA), abrir directamente

```ts
// backend/src/rooms/rooms.service.ts
@Injectable()
export class RoomsService {
  async createRoom(hostId: string): Promise<Room> {
    const code = nanoid(6).toUpperCase(); // ej: "AB12CD"
    const room = this.roomsRepo.create({ hostId, code, status: 'waiting' });
    await this.roomsRepo.save(room);
    await this.redis.setex(`room:${room.id}:state`, 3600, JSON.stringify({ players: [], mode: null }));
    return room;
  }
}
```

---

### TAREA 2.3 — Pico Botella (Modo 1)
**Prioridad:** Máxima | **Tiempo estimado:** 1 día

- [ ] Evento `bottle:spin` → servidor calcula destino aleatorio entre jugadores activos
- [ ] Animación CSS de botella en frontend (Framer Motion rotate)
- [ ] Al terminar la animación: emitir `bottle:result` con `{ from, to }` solo al host
- [ ] Opción de señal de interés: jugador puede marcar interés en el destino (silenciosamente)
- [ ] Regla: si A→B y B→A (en giros distintos), al final de la partida: `bottle:match { userA, userB }`

```ts
// backend/src/game/modes/bottle.service.ts
@Injectable()
export class BottleService {
  async spin(roomId: string, spinnerId: string): Promise<SpinResult> {
    const state = await this.redis.get(`room:${roomId}:state`);
    const { players } = JSON.parse(state);
    const others = players.filter(p => p !== spinnerId);
    const target = others[Math.floor(Math.random() * others.length)];
    await this.redis.setex(`room:${roomId}:last_spin`, 300, JSON.stringify({ from: spinnerId, to: target }));
    return { from: spinnerId, to: target };
  }

  async signalInterest(roomId: string, fromId: string, toId: string): Promise<void> {
    await this.redis.sadd(`room:${roomId}:interests:${fromId}`, toId);
    // Verificar match mutuo en silencio
    const mutual = await this.redis.sismember(`room:${roomId}:interests:${toId}`, fromId);
    if (mutual) {
      await this.redis.sadd(`room:${roomId}:matches`, JSON.stringify({ a: fromId, b: toId }));
    }
  }
}
```

---

### TAREA 2.4 — Verdad o Reto (Modo 2)
**Prioridad:** Máxima | **Tiempo estimado:** 1 día

- [ ] El jugador activo elige: `truth` o `dare`
- [ ] `challenges:get` → buscar en pool de BD por `{ type, intensity, tags[] }`; si < 3 disponibles → llamar a OpenAI
- [ ] El jugador puede pasar (máximo 1 vez por partida): `challenge:skip`
- [ ] Al completar: el grupo vota `challenge:vote { completed: bool }` → si mayoría dice sí, sumar puntos

```ts
// backend/src/challenges/challenges.service.ts
@Injectable()
export class ChallengesService {
  async getChallenge(type: 'truth' | 'dare', intensity: number, tags: string[]): Promise<Challenge> {
    // 1. Buscar en pool
    const pool = await this.challengesRepo.findBy({ type, intensity, tags: Any(tags), active: true });
    if (pool.length >= 3) return pool[Math.floor(Math.random() * pool.length)];

    // 2. Fallback a IA
    const prompt = `Genera un reto de tipo "${type}" con intensidad ${intensity}/5 para un juego de grupo entre jóvenes. Tags: ${tags.join(', ')}. Solo el texto del reto, sin comillas ni explicaciones.`;
    const text = await this.aiService.complete(prompt);
    // Guardar en pool para reutilizar
    const challenge = this.challengesRepo.create({ type, intensity, tags, text, source: 'ai' });
    await this.challengesRepo.save(challenge);
    return challenge;
  }
}
```

---

### TAREA 2.5 — Batalla 1v1 (Modo 3)
**Prioridad:** Alta | **Tiempo estimado:** 1 día

- [ ] El host selecciona dos jugadores: `battle:start { player1, player2 }`
- [ ] Ambos jugadores reciben una pregunta simultánea (ej: "¿Quién es más atrevido?")
- [ ] El grupo vota por uno de los dos: `battle:vote { roundId, votedFor }`
- [ ] 3 rondas por batalla, el ganador acumula puntos
- [ ] Broadcast resultado: `battle:round_result { winner, votes, scores }`

```ts
// backend/src/game/modes/battle-1v1.service.ts
@Injectable()
export class Battle1v1Service {
  async startBattle(roomId: string, player1: string, player2: string): Promise<BattleRound> {
    const question = await this.challengesService.getChallenge('battle', 3, ['1v1']);
    const roundId = uuid();
    await this.redis.setex(`room:${roomId}:battle:${roundId}`, 120, JSON.stringify({
      player1, player2, question: question.text, votes: {}, status: 'voting'
    }));
    return { roundId, question: question.text, player1, player2 };
  }
}
```

---

### TAREA 2.6 — Modo Liga (Modo 4)
**Prioridad:** Alta | **Tiempo estimado:** 1 día

- [ ] Todos los jugadores compiten en una serie de retos rápidos (30 segundos cada uno)
- [ ] Puntuación acumulativa durante la sesión: `league:score_update`
- [ ] Al final: tabla de posiciones completa: `league:final_standings`
- [ ] Bonus por racha ganadora (3+ consecutivos): `league:streak_bonus { userId, bonus }`
- [ ] Guardar estadísticas en tabla `game_sessions` para historial de usuario

---

### TAREA 2.7 — Señales de interés + reveal al final
**Prioridad:** Máxima | **Tiempo estimado:** 4 horas

- [ ] Durante cualquier modo: botón discreto "Me interesa" (solo visible para el usuario)
- [ ] `interest:signal { targetId }` → guardado en Redis, nunca broadcast
- [ ] Al finalizar la partida (`room:end`): el servidor computa matches mutuos
- [ ] Solo se emite `room:match_reveal` si hay match; si A le gustó B pero B no marcó A → silencio total
- [ ] Matches guardados en tabla `interest_matches` para historial

```ts
// backend/src/game/game.service.ts — al finalizar partida
async endRoom(roomId: string): Promise<void> {
  const playerIds = await this.getPlayers(roomId);
  const matches: Match[] = [];
  for (const playerId of playerIds) {
    const interests = await this.redis.smembers(`room:${roomId}:interests:${playerId}`);
    for (const targetId of interests) {
      const mutual = await this.redis.sismember(`room:${roomId}:interests:${targetId}`, playerId);
      if (mutual && !matches.find(m => m.users.includes(targetId) && m.users.includes(playerId))) {
        matches.push({ users: [playerId, targetId] });
      }
    }
  }
  // Guardar matches en BD y emitir reveal solo a los involucrados
  for (const match of matches) {
    await this.saveMatch(roomId, match);
    this.server.to(match.users[0]).emit('room:match_reveal', { matchedWith: match.users[1] });
    this.server.to(match.users[1]).emit('room:match_reveal', { matchedWith: match.users[0] });
  }
  await this.cleanupRedis(roomId);
}
```

---

### TAREA 2.8 — Setup deploy MVP
**Prioridad:** Alta | **Tiempo estimado:** 4 horas

- [ ] Railway: crear proyecto, conectar repo GitHub, añadir PostgreSQL plugin, añadir Redis plugin
- [ ] Vercel: conectar carpeta `frontend/`, configurar variables de entorno
- [ ] Cloudflare: apuntar dominio, activar proxy (SSL gratuito + protección DDoS)
- [ ] GitHub Actions: pipeline CI → build + test en cada PR
- [ ] Variables de entorno: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `FRONTEND_URL`

---

## MES 3 — JUEGOS ADICIONALES + PERFILES

### TAREA 3.1 — El Juicio (Modo 5)
**Prioridad:** Alta | **Tiempo estimado:** 4 horas

- [ ] Un jugador es "el juzgado", el resto son "jueces"
- [ ] Pantalla del juzgado: pregunta sobre sí mismo (ej: "¿Qué crees que piensan de ti?")
- [ ] Pantalla de jueces: votan anónimamente (opciones A/B/C)
- [ ] `juicio:reveal` → mostrar votación real vs predicción del juzgado
- [ ] Si la predicción del juzgado fue exacta: bonus de puntos

---

### TAREA 3.2 — Modo Oscuro (Modo 6) — Requiere Premium
**Prioridad:** Alta | **Tiempo estimado:** 4 horas

- [ ] Solo accesible con cuenta Premium (`PremiumGuard`)
- [ ] Retos de mayor intensidad (nivel 4-5): contenido adulto, preguntas íntimas
- [ ] Verificación de edad obligatoria al entrar: `AgeVerificationGuard` (18+)
- [ ] Los retos de Modo Oscuro están en tabla separada `dark_challenges`
- [ ] Marca de agua en pantalla: "Solo para mayores de 18"

```ts
// backend/src/game/game.gateway.ts
@SubscribeMessage('game:set_mode')
@UseGuards(WsJwtGuard, WsPremiumGuard)
async handleSetMode(@ConnectedSocket() client: Socket, @MessageBody() dto: SetModeDto) {
  if (dto.mode === 'oscuro') {
    const user = client.data.user;
    if (!user.ageVerified) throw new WsException('Verificación de edad requerida');
  }
  // ...
}
```

---

### TAREA 3.3 — Cartas sobre la Mesa (Modo 7)
**Prioridad:** Media | **Tiempo estimado:** 4 horas

- [ ] Cada jugador recibe 3 "cartas" secretas (afirmaciones sobre sí mismo o el grupo)
- [ ] Por turnos, cada jugador puede "jugar" una carta
- [ ] El grupo decide si la carta es verdad o mentira: `cartas:vote { cardId, verdict }`
- [ ] Si la mayoría acierta: el que jugó la carta pierde puntos; si la mayoría falla: gana puntos
- [ ] Al final: revelar todas las cartas no jugadas

---

### TAREA 3.4 — Termómetro Humano (Modo 8)
**Prioridad:** Media | **Tiempo estimado:** 4 horas

- [ ] Se lanza una pregunta del tipo "¿Quién en este grupo es más X?"
- [ ] Cada jugador se autoposiciona en una escala 1-10: `termometro:position { userId, value }`
- [ ] Se visualiza el "termómetro" con todos los valores (anónimos hasta el reveal)
- [ ] `termometro:reveal` → mostrar quién puso qué posición
- [ ] Debate: los que pusieron valores extremos deben justificarse

---

### TAREA 3.5 — Actores sin Guion (Modo 9)
**Prioridad:** Media | **Tiempo estimado:** 4 horas

- [ ] El servidor asigna un rol secreto a cada jugador (ej: "el seductor", "el tímido", "el directo")
- [ ] Escenario grupal: todos deben actuar su rol durante 5 minutos de conversación libre
- [ ] Al final: votar quién fue el mejor actor: `actores:vote { bestActor: userId }`
- [ ] El grupo también adivina qué rol tuvo cada uno: `actores:guess { userId, guessedRole }`
- [ ] Puntos por: actuar bien + adivinar correctamente

---

### TAREA 3.6 — El Último en Pie (Modo 10)
**Prioridad:** Media | **Tiempo estimado:** 4 horas

- [ ] Eliminación progresiva: el grupo vota quién sale en cada ronda
- [ ] El votado más veces recibe un "reto de salvación": si lo completa, se salva
- [ ] `ultimo:elimination_vote` → broadcast de resultados → reto de salvación
- [ ] El último jugador en pie gana la partida + bonus LLAMAS
- [ ] Modo especial: el eliminado puede volver si completa el "reto extremo" (Premium)

---

### TAREA 3.7 — Todo o Nada (Modo 11)
**Prioridad:** Media | **Tiempo estimado:** 4 horas

- [ ] Jugador activo apuesta LLAMAS (1-50) antes de conocer el reto
- [ ] Si completa el reto (votación del grupo): gana el doble
- [ ] Si falla: pierde la apuesta
- [ ] `todo_nada:bet { amount }` → validar balance suficiente → `todo_nada:challenge_reveal`
- [ ] Validar que el balance LLAMAS se descuenta/acredita via `llamas_transactions`

---

### TAREA 3.8 — Sistema de perfiles + historial
**Prioridad:** Alta | **Tiempo estimado:** 1 día

- [ ] Perfil público: avatar, nombre, rango de Carisma, estadísticas públicas
- [ ] Historial privado: partidas jugadas, matches revelados, LLAMAS ganadas/gastadas
- [ ] `GET /users/:id/profile` → perfil público
- [ ] `GET /users/me/history` → historial privado con paginación
- [ ] Avatar: upload a Cloudflare R2 o usar dicebear.com para avatares generados

---

## MES 4 — GAMIFICACIÓN + ARENA + EL HILO

### TAREA 4.1 — Rango de Carisma + sistema de insignias
**Prioridad:** Alta | **Tiempo estimado:** 1 día

5 niveles de rango, calculados a partir de puntos de carisma acumulados:

| Rango | Nombre | Puntos requeridos | Color |
|---|---|---|---|
| 1 | Spark | 0 - 499 | Gris |
| 2 | Flame | 500 - 1999 | Naranja |
| 3 | Blaze | 2000 - 4999 | Rojo |
| 4 | Inferno | 5000 - 9999 | Rojo oscuro |
| 5 | Legend | 10000+ | Dorado |

- [ ] Puntos de carisma: +10 por partida completada, +5 por reto aceptado, +15 por match revelado
- [ ] Insignias especiales: "Primer match", "10 partidas", "Modo Oscuro desbloqueado", "LLAMAS millonario"
- [ ] Tabla `charisma_ranks` con histórico de cambios de rango
- [ ] Notificación al subir de rango: `user:rank_up { newRank, oldRank }`

---

### TAREA 4.2 — Arena: El Estadio (feature 1)
**Prioridad:** Alta | **Tiempo estimado:** 4 horas

- [ ] Sala pública de hasta 50 jugadores (vs 8 en salas normales)
- [ ] Modo espectador: observadores pueden ver pero no participar
- [ ] `arena:join_stadium { stadiumId }` → unirse como jugador o espectador
- [ ] Moderador asignado: puede silenciar jugadores, expulsar, pausar
- [ ] Validar mínimo 5 participantes antes de iniciar

---

### TAREA 4.3 — Arena: La Silla Caliente (feature 2)
**Prioridad:** Alta | **Tiempo estimado:** 4 horas

- [ ] Un jugador en "la silla" durante 2 minutos: el grupo le lanza preguntas
- [ ] El jugador en la silla elige qué preguntas responder (puede ignorar max 2)
- [ ] `silla:question { from, question }` → moderado antes de enviar al jugador en silla
- [ ] El grupo evalúa las respuestas: `silla:rate { score: 1-5 }`
- [ ] Puntuación final basada en honestidad percibida

---

### TAREA 4.4 — Arena: El Sobre Rojo (feature 3) — Premium
**Prioridad:** Alta | **Tiempo estimado:** 4 horas

- [ ] Cualquier jugador puede enviar un mensaje anónimo al grupo: `sobre:send { message }`
- [ ] El host elige cuándo "abrir" el sobre: `sobre:open { sobreId }`
- [ ] El grupo adivina quién lo envió: `sobre:guess { sender: userId }`
- [ ] Si nadie adivina: el remitente gana puntos (y puede elegir revelarse)
- [ ] Requiere `PremiumGuard` — solo cuentas Premium pueden enviar sobres rojos

---

### TAREA 4.5 — Arena: La Corona Semanal (feature 4)
**Prioridad:** Media | **Tiempo estimado:** 4 horas

- [ ] Ranking semanal de los jugadores con más puntos de carisma en la semana
- [ ] Top 3 reciben corona especial visible en su perfil durante esa semana
- [ ] Cron job semanal (NestJS `@Cron`): resetear ranking + asignar coronas + notificar
- [ ] `GET /arena/weekly-crown` → ranking actual
- [ ] Bonus LLAMAS para top 3: 1000 / 500 / 250

```ts
// backend/src/arena/arena.service.ts
@Cron('0 0 * * 1') // Lunes a medianoche
async assignWeeklyCrown(): Promise<void> {
  const top3 = await this.db.query(`
    SELECT user_id, SUM(points) as weekly_points
    FROM charisma_events
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY user_id ORDER BY weekly_points DESC LIMIT 3
  `);
  // Asignar coronas + bonus LLAMAS
  for (const [i, user] of top3.entries()) {
    const bonus = [1000, 500, 250][i];
    await this.llamasService.credit(user.user_id, bonus, 'weekly_crown');
  }
}
```

---

### TAREA 4.6 — Arena: Quién en tu Curso (feature 5)
**Prioridad:** Media | **Tiempo estimado:** 4 horas

- [ ] Preguntas del tipo "¿Quién en esta sala es más probable que...?"
- [ ] Todos votan simultáneamente: `arena:vote_person { questionId, votedFor }`
- [ ] Reveal: mostrar distribución de votos + ganador de cada pregunta
- [ ] El más votado en cada pregunta acumula puntos de "popularidad"
- [ ] Categorías: atrevido, gracioso, romántico, misterioso, directo

---

### TAREA 4.7 — Arena: Termómetro del Colegio (feature 6)
**Prioridad:** Media | **Tiempo estimado:** 4 horas

- [ ] Versión Arena del Termómetro Humano: escala de temperatura grupal
- [ ] Preguntas a nivel de grupo: "¿Qué tan atrevido es este grupo?"
- [ ] Todos votan en escala 1-10, resultado: promedio + distribución
- [ ] Comparación con otras salas (si el usuario acepta compartir el dato)
- [ ] "Temperatura récord" del grupo mostrada al final

---

### TAREA 4.8 — Arena: Momento Épico (feature 7)
**Prioridad:** Media | **Tiempo estimado:** 4 horas

- [ ] Cualquier jugador puede declarar "momento épico" en cualquier punto
- [ ] El grupo vota si fue realmente épico (thumbs up/down)
- [ ] Si mayoría dice épico: se guarda en el "Hall of Fame" de la sala
- [ ] `arena:epic_moment { description, nominatedBy }` → votación → `arena:epic_confirmed`
- [ ] Al final de la sesión: resumen de momentos épicos de esa sala

---

### TAREA 4.9 — Arena: La Ruleta Maldita (feature 8)
**Prioridad:** Media | **Tiempo estimado:** 4 horas

- [ ] Ruleta con penalizaciones y bonificaciones: gira en momentos aleatorios
- [ ] Opciones: "Pierde 20 LLAMAS", "El grupo te hace una pregunta", "Duplica tus puntos", "Reto especial"
- [ ] `arena:ruleta_spin { targetUserId }` → host puede apuntar a cualquier jugador
- [ ] Animación de ruleta en frontend (SVG + Framer Motion)
- [ ] La "maldición" dura hasta que el jugador complete el reto asignado

---

### TAREA 4.10 — Arena: El Shipper (feature 9)
**Prioridad:** Media | **Tiempo estimado:** 4 horas

- [ ] El grupo vota qué dos personas de la sala hacen mejor pareja
- [ ] `arena:ship { person1, person2 }` → cada jugador propone un ship
- [ ] Votación final: el ship con más votos es "el ship oficial de la noche"
- [ ] Los dos "shipeados" reciben notificación especial y LLAMAS bonus
- [ ] Los resultados se guardan (con consentimiento) para estadísticas de Arena

---

### TAREA 4.11 — El Hilo: Sistema base + niveles de tensión
**Prioridad:** Máxima | **Tiempo estimado:** 2 días

El Hilo es un chat con tensión progresiva. 5 niveles:

| Nivel | Nombre | Color | Desbloqueado por |
|---|---|---|---|
| 1 | Frío | Azul | Por defecto |
| 2 | Tibio | Verde | 10 mensajes |
| 3 | Caliente | Naranja | 25 mensajes + reacciones |
| 4 | Ardiente | Rojo | 50 mensajes + reto completado |
| 5 | Peligroso | Rojo oscuro pulsante | Premium + 100 mensajes |

- [ ] `HiloGateway`: namespace `/hilo`, separado del gateway principal
- [ ] Tensión calculada en Redis: `hilo:{roomId}:tension` → puntuación 0-100
- [ ] Cada mensaje suma puntos de tensión; las reacciones amplifican
- [ ] Flush a `hilo_tension_history` cada 5 minutos via cron
- [ ] Nivel 5 "Peligroso" requiere `PremiumGuard`

```ts
// backend/src/hilo/hilo.gateway.ts
@WebSocketGateway({ namespace: '/hilo', cors: { origin: process.env.FRONTEND_URL } })
export class HiloGateway {
  @SubscribeMessage('hilo:message')
  async handleMessage(@ConnectedSocket() client: Socket, @MessageBody() dto: HiloMessageDto) {
    // 1. Moderación (OpenAI Moderation API)
    const modResult = await this.aiService.moderate(dto.text);
    if (modResult.flagged) throw new WsException('Mensaje no permitido');

    // 2. Actualizar tensión en Redis
    const tensionKey = `hilo:${dto.roomId}:tension`;
    const newTension = await this.redis.incrby(tensionKey, dto.tensionPoints ?? 1);
    await this.redis.expire(tensionKey, 86400);

    // 3. Calcular nivel
    const level = this.calculateLevel(newTension);

    // 4. Broadcast (con o sin userId según modo anónimo)
    const senderId = dto.anonymous ? dto.aliasId : client.data.user.id;
    this.server.to(dto.roomId).emit('hilo:message_broadcast', {
      senderId, text: dto.text, tension: newTension, level
    });
  }

  private calculateLevel(tension: number): number {
    if (tension < 20) return 1;
    if (tension < 40) return 2;
    if (tension < 60) return 3;
    if (tension < 80) return 4;
    return 5;
  }
}
```

---

### TAREA 4.12 — El Hilo: 4 tipos de Hilo + funciones por nivel
**Prioridad:** Alta | **Tiempo estimado:** 1 día

**4 tipos de Hilo:**
1. **Hilo Directo**: mensajes visibles para todos en la sala
2. **Hilo Secreto** (Premium): 2 jugadores específicos se comunican en privado
3. **Hilo Anónimo**: el remitente es un alias generado (sin revelar identidad)
4. **Hilo Ardiente** (Premium + nivel 4+): mensajes se autodestruyen en 60 segundos

**Funciones exclusivas por nivel:**
- Nivel 1-2: texto básico + emojis
- Nivel 3: reacciones animadas + GIFs (Tenor API)
- Nivel 4: "Confesión Ardiente" — mensaje especialmente marcado
- Nivel 5: "Modo Peligroso" — revelar pensamientos sin filtro (Premium)

- [ ] `hilo:set_type { type }` → validar Premium si aplica
- [ ] `hilo:reaction { messageId, emoji }` → suma tensión
- [ ] `hilo:confession { text }` → nivel 4+, guardado permanentemente
- [ ] Hilo Ardiente: `setTimeout` en Redis para auto-borrar mensaje

---

### TAREA 4.13 — El Hilo: puntuación de tensión + Redis architecture
**Prioridad:** Alta | **Tiempo estimado:** 4 horas

- [ ] `hilo:{roomId}:tension` → entero Redis (0-100)
- [ ] Puntos por acción: mensaje +1, reacción +2, confesión +5, GIF +1, skip -1
- [ ] Cron cada 5 minutos: leer tensión de Redis → insertar en `hilo_tension_history`
- [ ] Si tensión llega a 100: evento especial `hilo:max_tension` → bonus LLAMAS para todos
- [ ] Dashboard de tensión en tiempo real en el frontend (gráfico de línea con TanStack Query)

---

## MES 5 — MONETIZACIÓN

### TAREA 5.1 — LLAMAS Economy (moneda virtual)
**Prioridad:** Máxima | **Tiempo estimado:** 2 días

LLAMAS es la moneda virtual del juego. Principio: **el balance siempre se deriva del ledger**.

**Formas de ganar LLAMAS:**
- +25 por primera partida del día
- +10 por completar un reto
- +15 por match revelado
- +5 por reacción en El Hilo
- +50 por subir de rango de Carisma
- +100 por invitar a un amigo (referral)

**Formas de gastar LLAMAS:**
- -10 por apuesta en Todo o Nada
- -50 por activar El Hilo Secreto
- -30 por enviar Sobre Rojo
- -100 por activar "Momento Especial" en Arena

```ts
// backend/src/llamas/llamas.service.ts
@Injectable()
export class LlamasService {
  async credit(userId: string, amount: number, reason: string): Promise<LlamasTransaction> {
    const tx = this.txRepo.create({ userId, amount: +amount, reason, type: 'credit' });
    return this.txRepo.save(tx);
  }

  async debit(userId: string, amount: number, reason: string): Promise<LlamasTransaction> {
    const balance = await this.getBalance(userId);
    if (balance < amount) throw new BadRequestException('Balance insuficiente de LLAMAS');
    const tx = this.txRepo.create({ userId, amount: -amount, reason, type: 'debit' });
    return this.txRepo.save(tx);
  }

  async getBalance(userId: string): Promise<number> {
    // SIEMPRE derivado del ledger, nunca de columna balance
    const result = await this.txRepo
      .createQueryBuilder('tx')
      .select('COALESCE(SUM(tx.amount), 0)', 'balance')
      .where('tx.userId = :userId', { userId })
      .getRawOne();
    return parseInt(result.balance);
  }
}
```

---

### TAREA 5.2 — Premium $4.99/mes con Stripe
**Prioridad:** Máxima | **Tiempo estimado:** 2 días

**Features Premium:**
- Modo Oscuro (contenido adulto 18+)
- El Hilo Secreto (chat privado 2 personas)
- El Hilo Ardiente (mensajes autodestructivos)
- Hilo Nivel 5 "Peligroso"
- El Sobre Rojo en Arena
- El Último en Pie: reto extremo
- Sin límite de salas por día (free: 3/día)

- [ ] Crear producto + precio en Stripe Dashboard: $4.99/mes recurrente
- [ ] `POST /payments/create-subscription` → Stripe Checkout Session
- [ ] Webhook `POST /payments/webhook`: `customer.subscription.created`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Grace period: 3 días después de pago fallido antes de revocar Premium
- [ ] `PremiumGuard`: verificar `user.isPremium && !user.gracePeriodExpired`

```ts
// backend/src/payments/payments.controller.ts
@Post('webhook')
@HttpCode(200)
async handleWebhook(@Req() req: Request, @Headers('stripe-signature') sig: string) {
  const event = this.stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await this.paymentsService.activatePremium(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await this.paymentsService.deactivatePremium(event.data.object.customer as string);
      break;
    case 'invoice.payment_failed':
      await this.paymentsService.startGracePeriod(event.data.object.customer as string);
      break;
  }
  return { received: true };
}
```

---

### TAREA 5.3 — Analytics: Plausible self-hosted
**Prioridad:** Media | **Tiempo estimado:** 4 horas

- [ ] Instalar Plausible CE en Hostinger VPS (Docker): `docker compose up plausible`
- [ ] Integrar script en frontend: `<script defer data-domain="battleflirt.app" src="https://analytics.battleflirt.app/js/script.js">`
- [ ] Eventos custom: `plausible('Game Started', { props: { mode: 'bottle' } })`
- [ ] Eventos críticos a trackear: `room_created`, `game_started`, `match_revealed`, `premium_subscribed`, `llamas_spent`
- [ ] Dashboard accesible solo para admins

---

### TAREA 5.4 — Sistema de referidos
**Prioridad:** Media | **Tiempo estimado:** 4 horas

- [ ] Al registrarse: generar código único de referido (`REF-{userId-truncado}`)
- [ ] Link de referido: `https://battleflirt.app/join?ref=REF-ABC123`
- [ ] Al nuevo usuario completar primera partida: acreditar 100 LLAMAS al referidor
- [ ] Tabla `referrals` para tracking: `referrer_id`, `referred_id`, `rewarded_at`
- [ ] Límite: máximo 50 referidos por usuario (anti-abuse)

---

## MES 6 — BETA + LANZAMIENTO

### TAREA 6.1 — Beta cerrada con códigos de invitación
**Prioridad:** Alta | **Tiempo estimado:** 1 día

- [ ] Generar batch de 200 códigos únicos: `BETA-{nanoid(8).toUpperCase()}`
- [ ] Tabla `beta_codes`: `code`, `used_by`, `used_at`
- [ ] Registro bloqueado sin código válido durante beta
- [ ] Panel admin: `GET /admin/beta-codes` → listar uso de códigos
- [ ] Email de bienvenida al activar código: 500 LLAMAS de regalo

---

### TAREA 6.2 — Load testing con k6
**Prioridad:** Alta | **Tiempo estimado:** 1 día

- [ ] Instalar k6: `choco install k6` o via Docker
- [ ] Script de test: 100 usuarios concurrentes creando salas + jugando Pico Botella durante 5 minutos
- [ ] Métricas objetivo: p95 < 200ms, 0 errores 5xx, WebSocket latency < 50ms
- [ ] Test de carga de El Hilo: 50 usuarios enviando mensajes simultáneos
- [ ] Documentar cuellos de botella y optimizaciones aplicadas

```js
// k6/load-test.js
import { io } from 'https://jslib.k6.io/socketio/0.0.1/index.js';
export default function () {
  const socket = io.connect('wss://battleflirt.app', { auth: { token: __ENV.TEST_TOKEN } });
  socket.emit('room:join', { roomId: __ENV.ROOM_ID });
  socket.on('room:joined', () => {
    socket.emit('bottle:spin');
  });
  sleep(1);
}
```

---

### TAREA 6.3 — Moderación de contenido en El Hilo
**Prioridad:** Máxima | **Tiempo estimado:** 4 horas

- [ ] Cada mensaje del Hilo pasa por `aiService.moderate(text)` antes de broadcast
- [ ] OpenAI Moderation API: endpoint `POST /v1/moderations`
- [ ] Si `flagged: true`: rechazar mensaje, emitir `hilo:message_rejected` al remitente
- [ ] Acumular violaciones: 3 violaciones → expulsar de sala + ban temporal 24h
- [ ] Tabla `moderation_logs`: guardar todos los rechazos para auditoría

```ts
// backend/src/ai/ai.service.ts
async moderate(text: string): Promise<{ flagged: boolean; categories: object }> {
  const response = await this.openai.moderations.create({ input: text });
  return {
    flagged: response.results[0].flagged,
    categories: response.results[0].categories,
  };
}
```

---

### TAREA 6.4 — PWA: manifest + service worker + Web Push
**Prioridad:** Alta | **Tiempo estimado:** 1 día

- [ ] `vite-plugin-pwa`: configurar en `vite.config.ts`
- [ ] `manifest.json`: `name: "BattleFlirt"`, `theme_color: "#FF2D55"`, íconos 192px + 512px
- [ ] Service Worker: cachear assets estáticos, funcionar offline en la pantalla de sala
- [ ] Web Push: `VAPID keys` generados, `POST /users/push-subscription` para guardar subscripción
- [ ] Notificaciones: "Tienes un match revelado 🔥", "La corona semanal ha sido asignada", "Nuevo desafío disponible"

---

### TAREA 6.5 — Migración a Hostinger VPS
**Prioridad:** Media | **Tiempo estimado:** 1 día

- [ ] Contratar Hostinger KVM 2 (~$5-8/mes): 2 vCPU, 8GB RAM, 100GB NVMe
- [ ] Docker Compose en VPS: `nestjs`, `postgres`, `redis`, `plausible`
- [ ] Nginx como reverse proxy + certbot para SSL
- [ ] Configurar Cloudflare como proxy delante del VPS
- [ ] Script de deploy: `git pull + docker compose up -d --build`
- [ ] Monitoreo: UptimeRobot (free) para alertas de caída

---

## SCHEMA DE BASE DE DATOS

### Tablas Core (8)

```sql
-- 1. Usuarios
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  username      VARCHAR(50) UNIQUE NOT NULL,
  avatar_url    VARCHAR(500),
  is_premium    BOOLEAN DEFAULT FALSE,
  premium_expires_at TIMESTAMPTZ,
  grace_period_ends_at TIMESTAMPTZ,
  age_verified  BOOLEAN DEFAULT FALSE,
  stripe_customer_id VARCHAR(255),
  referral_code VARCHAR(20) UNIQUE,
  charisma_points INTEGER DEFAULT 0,
  current_rank  INTEGER DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Salas
CREATE TABLE rooms (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(10) UNIQUE NOT NULL,
  host_id     UUID REFERENCES users(id),
  status      VARCHAR(20) DEFAULT 'waiting', -- waiting, playing, finished
  mode        VARCHAR(50),
  max_players INTEGER DEFAULT 8,
  is_private  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  ended_at    TIMESTAMPTZ
);

-- 3. Jugadores en sala
CREATE TABLE room_players (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id   UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id   UUID REFERENCES users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at   TIMESTAMPTZ,
  score     INTEGER DEFAULT 0,
  UNIQUE(room_id, user_id)
);

-- 4. Sesiones de juego
CREATE TABLE game_sessions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id    UUID REFERENCES rooms(id),
  mode       VARCHAR(50) NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at   TIMESTAMPTZ,
  metadata   JSONB DEFAULT '{}'
);

-- 5. Matches de interés
CREATE TABLE interest_matches (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id    UUID REFERENCES rooms(id),
  user_a_id  UUID REFERENCES users(id),
  user_b_id  UUID REFERENCES users(id),
  revealed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, user_a_id, user_b_id)
);

-- 6. Eventos de carisma
CREATE TABLE charisma_events (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id),
  points     INTEGER NOT NULL,
  reason     VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Insignias
CREATE TABLE badges (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  badge_type  VARCHAR(50) NOT NULL,
  earned_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Referidos
CREATE TABLE referrals (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id  UUID REFERENCES users(id),
  referred_id  UUID REFERENCES users(id) UNIQUE,
  rewarded_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### Tablas LLAMAS Economy (2)

```sql
-- 9. Ledger de transacciones (append-only)
CREATE TABLE llamas_transactions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id),
  amount     INTEGER NOT NULL,  -- positivo = crédito, negativo = débito
  type       VARCHAR(20) NOT NULL, -- 'credit' | 'debit'
  reason     VARCHAR(100) NOT NULL,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- TRIGGER para prevenir UPDATE/DELETE
CREATE RULE no_update_llamas AS ON UPDATE TO llamas_transactions DO INSTEAD NOTHING;
CREATE RULE no_delete_llamas AS ON DELETE TO llamas_transactions DO INSTEAD NOTHING;

-- 10. Resumen de balance (materializado cada hora via cron)
CREATE MATERIALIZED VIEW llamas_balances AS
  SELECT user_id, COALESCE(SUM(amount), 0) AS balance
  FROM llamas_transactions
  GROUP BY user_id;
CREATE UNIQUE INDEX ON llamas_balances(user_id);
```

### Tablas de Retos (2)

```sql
-- 11. Pool de retos
CREATE TABLE challenges (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type       VARCHAR(20) NOT NULL, -- 'truth' | 'dare' | 'battle' | 'dark'
  intensity  INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 5),
  tags       TEXT[] DEFAULT '{}',
  text       TEXT NOT NULL,
  source     VARCHAR(20) DEFAULT 'manual', -- 'manual' | 'ai'
  active     BOOLEAN DEFAULT TRUE,
  uses_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Retos oscuros (tabla separada con acceso restringido)
CREATE TABLE dark_challenges (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intensity  INTEGER NOT NULL CHECK (intensity BETWEEN 4 AND 5),
  tags       TEXT[] DEFAULT '{}',
  text       TEXT NOT NULL,
  min_age    INTEGER DEFAULT 18,
  active     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tablas Arena (3)

```sql
-- 13. Estadios (salas Arena)
CREATE TABLE arena_stadiums (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(100) NOT NULL,
  host_id      UUID REFERENCES users(id),
  max_players  INTEGER DEFAULT 50,
  status       VARCHAR(20) DEFAULT 'open',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Eventos de Arena
CREATE TABLE arena_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stadium_id  UUID REFERENCES arena_stadiums(id),
  type        VARCHAR(50) NOT NULL, -- 'silla_caliente' | 'sobre_rojo' | 'corona' | etc
  initiated_by UUID REFERENCES users(id),
  data        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 15. Votos de Arena
CREATE TABLE arena_votes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id   UUID REFERENCES arena_events(id),
  voter_id   UUID REFERENCES users(id),
  voted_for  UUID REFERENCES users(id),
  value      INTEGER, -- para votaciones escalares (termómetro)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, voter_id)
);
```

### Tablas El Hilo (4)

```sql
-- 16. Hilos (instancias de chat con tensión)
CREATE TABLE hilos (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id    UUID REFERENCES rooms(id),
  type       VARCHAR(20) NOT NULL, -- 'directo' | 'secreto' | 'anonimo' | 'ardiente'
  status     VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at   TIMESTAMPTZ
);

-- 17. Mensajes del Hilo
CREATE TABLE hilo_messages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hilo_id      UUID REFERENCES hilos(id),
  sender_id    UUID REFERENCES users(id), -- NULL si anónimo
  alias_id     VARCHAR(50), -- para modo anónimo
  text         TEXT NOT NULL,
  tension_at_send INTEGER NOT NULL,
  level_at_send   INTEGER NOT NULL,
  expires_at   TIMESTAMPTZ, -- para tipo 'ardiente'
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 18. Historial de tensión del Hilo
CREATE TABLE hilo_tension_history (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hilo_id    UUID REFERENCES hilos(id),
  tension    INTEGER NOT NULL,
  level      INTEGER NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. Confesiones del Hilo (nivel 4+, permanentes)
CREATE TABLE hilo_confessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hilo_id     UUID REFERENCES hilos(id),
  confessor_id UUID REFERENCES users(id),
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### Tablas Pagos + Moderación (4)

```sql
-- 20. Subscripciones Premium
CREATE TABLE premium_subscriptions (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID REFERENCES users(id) UNIQUE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  status               VARCHAR(20) NOT NULL, -- 'active' | 'grace' | 'cancelled'
  current_period_end   TIMESTAMPTZ,
  grace_period_end     TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 21. Logs de moderación
CREATE TABLE moderation_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  room_id     UUID REFERENCES rooms(id),
  content     TEXT NOT NULL,
  categories  JSONB NOT NULL,
  action      VARCHAR(20) NOT NULL, -- 'rejected' | 'banned_temp' | 'banned_perm'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 22. Códigos beta
CREATE TABLE beta_codes (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code      VARCHAR(20) UNIQUE NOT NULL,
  used_by   UUID REFERENCES users(id),
  used_at   TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 23. Pushsuscripciones Web Push
CREATE TABLE push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id),
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### Tablas Gamificación (2)

```sql
-- 24. Historial de rangos de Carisma
CREATE TABLE charisma_ranks (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id),
  old_rank   INTEGER NOT NULL,
  new_rank   INTEGER NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 25. Momentos Épicos de Arena
CREATE TABLE epic_moments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stadium_id   UUID REFERENCES arena_stadiums(id),
  nominated_by UUID REFERENCES users(id),
  description  TEXT NOT NULL,
  vote_count   INTEGER DEFAULT 0,
  confirmed    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### Índices críticos

```sql
-- Consultas frecuentes
CREATE INDEX idx_room_players_room ON room_players(room_id);
CREATE INDEX idx_room_players_user ON room_players(user_id);
CREATE INDEX idx_llamas_tx_user ON llamas_transactions(user_id);
CREATE INDEX idx_llamas_tx_created ON llamas_transactions(created_at DESC);
CREATE INDEX idx_charisma_events_user ON charisma_events(user_id);
CREATE INDEX idx_charisma_events_created ON charisma_events(created_at DESC);
CREATE INDEX idx_hilo_messages_hilo ON hilo_messages(hilo_id);
CREATE INDEX idx_arena_votes_event ON arena_votes(event_id);
CREATE INDEX idx_moderation_logs_user ON moderation_logs(user_id);
```

---

## CONTRATOS SOCKET.IO

### Namespace `/` — GameGateway (módulo principal)

#### Eventos del cliente → servidor
| Evento | Payload | Descripción |
|---|---|---|
| `room:join` | `{ roomId, token }` | Unirse a una sala |
| `room:leave` | `{ roomId }` | Salir de una sala |
| `game:set_mode` | `{ roomId, mode }` | Host selecciona modo de juego |
| `game:start` | `{ roomId }` | Host inicia la partida |
| `game:end` | `{ roomId }` | Host termina la partida |
| `bottle:spin` | `{ roomId }` | Girar la botella |
| `interest:signal` | `{ roomId, targetId }` | Señal de interés (silenciosa) |
| `challenge:get` | `{ type, intensity, tags }` | Obtener reto |
| `challenge:skip` | `{ roomId, challengeId }` | Pasar reto (1x por partida) |
| `challenge:vote` | `{ roomId, challengeId, completed }` | Votar si reto fue completado |
| `battle:start` | `{ roomId, player1, player2 }` | Iniciar batalla 1v1 |
| `battle:vote` | `{ roundId, votedFor }` | Votar en batalla |
| `juicio:predict` | `{ roomId, prediction }` | Jugador predice votación |
| `juicio:vote` | `{ roomId, questionId, answer }` | Jueces votan |
| `cartas:play` | `{ roomId, cardId }` | Jugar una carta |
| `cartas:verdict` | `{ roomId, cardId, verdict }` | Votar verdad/mentira |
| `termometro:position` | `{ roomId, value }` | Posicionarse en escala |
| `actores:vote_best` | `{ roomId, userId }` | Votar mejor actor |
| `actores:guess_role` | `{ roomId, userId, role }` | Adivinar rol de actor |
| `ultimo:vote_elim` | `{ roomId, targetId }` | Votar eliminación |
| `todo_nada:bet` | `{ roomId, amount }` | Apostar LLAMAS |
| `todo_nada:complete` | `{ roomId, challengeId }` | Declarar reto completado |

#### Eventos servidor → cliente
| Evento | Payload | Descripción |
|---|---|---|
| `room:joined` | `{ room, players }` | Confirmación de unirse |
| `room:player_joined` | `{ userId, username }` | Otro jugador se unió |
| `room:player_left` | `{ userId }` | Jugador salió |
| `room:mode_set` | `{ mode }` | Modo seleccionado |
| `room:game_started` | `{ mode, round: 1 }` | Partida iniciada |
| `room:match_reveal` | `{ matchedWith: userId }` | Match revelado (privado) |
| `bottle:result` | `{ from, to, animation }` | Resultado del giro |
| `challenge:received` | `{ challenge }` | Reto asignado |
| `challenge:vote_result` | `{ completed, votes, points }` | Resultado de votación |
| `battle:round_result` | `{ winner, votes, scores }` | Resultado de ronda |
| `league:score_update` | `{ scores: [] }` | Tabla de puntuación |
| `league:final_standings` | `{ standings: [] }` | Resultado final Liga |
| `user:rank_up` | `{ newRank, oldRank, bonus }` | Subida de rango |
| `room:error` | `{ code, message }` | Error en acción |

### Namespace `/arena` — ArenaGateway

| Evento (cliente→servidor) | Payload | Descripción |
|---|---|---|
| `arena:join_stadium` | `{ stadiumId, role }` | `role`: 'player' o 'spectator' |
| `arena:vote` | `{ eventId, votedFor, value? }` | Voto genérico de Arena |
| `silla:question` | `{ stadiumId, question }` | Lanzar pregunta a la silla |
| `silla:rate` | `{ eventId, score }` | Calificar respuesta |
| `sobre:send` | `{ stadiumId, message }` | Enviar sobre rojo (Premium) |
| `sobre:open` | `{ sobreId }` | Host abre sobre |
| `sobre:guess` | `{ sobreId, sender }` | Adivinar remitente |
| `arena:ruleta_spin` | `{ stadiumId, targetId }` | Girar ruleta maldita |
| `arena:ship` | `{ stadiumId, person1, person2 }` | Proponer ship |
| `arena:epic_moment` | `{ stadiumId, description }` | Nominar momento épico |

| Evento (servidor→cliente) | Payload | Descripción |
|---|---|---|
| `arena:joined` | `{ stadium, participants }` | Confirmación unirse |
| `arena:feature_start` | `{ feature, data }` | Feature de Arena iniciado |
| `arena:vote_result` | `{ results, winner? }` | Resultado de votación |
| `corona:assigned` | `{ top3: [] }` | Corona semanal asignada |
| `ruleta:result` | `{ target, penalty }` | Resultado de ruleta |
| `arena:ship_official` | `{ ship: [user1, user2], votes }` | Ship ganador |
| `arena:epic_confirmed` | `{ moment }` | Momento épico confirmado |

### Namespace `/hilo` — HiloGateway

| Evento (cliente→servidor) | Payload | Descripción |
|---|---|---|
| `hilo:join` | `{ roomId, type, anonymous? }` | Entrar al Hilo |
| `hilo:message` | `{ roomId, text, anonymous? }` | Enviar mensaje |
| `hilo:reaction` | `{ messageId, emoji }` | Reaccionar a mensaje |
| `hilo:confession` | `{ roomId, text }` | Confesión (nivel 4+) |
| `hilo:set_type` | `{ roomId, type }` | Cambiar tipo de Hilo |

| Evento (servidor→cliente) | Payload | Descripción |
|---|---|---|
| `hilo:joined` | `{ hilo, tension, level }` | Confirmación unirse |
| `hilo:message_broadcast` | `{ senderId, text, tension, level }` | Mensaje broadcast |
| `hilo:message_rejected` | `{ reason }` | Mensaje rechazado por moderación |
| `hilo:tension_update` | `{ tension, level }` | Actualización de tensión |
| `hilo:level_up` | `{ newLevel, unlockedFeatures }` | Subida de nivel |
| `hilo:max_tension` | `{ bonus }` | Tensión máxima alcanzada |
| `hilo:confession_broadcast` | `{ confessorAlias, text }` | Confesión recibida |

---

## COSTOS MVP (~500 usuarios)

| Servicio | Costo/mes |
|---|---|
| Railway Hobby (NestJS) | $5 |
| Vercel (React) | $0 |
| PostgreSQL (Railway plugin) | $0 |
| Upstash Redis (10k cmd/día) | $0 |
| OpenAI GPT-4o-mini (500×3×5 calls) | ~$0.45 |
| Cloudflare (proxy + SSL) | $0 |
| Dominio | ~$1 |
| **Total** | **~$6.45/mes** |

**Migración a escala (Mes 4+):**
| Servicio | Costo/mes |
|---|---|
| Hostinger KVM VPS (NestJS + PostgreSQL + Redis) | $5-8 |
| Vercel (React) | $0 |
| Redis Cloud (100MB) | $5 |
| OpenAI (escala) | ~$5 |
| Cloudflare | $0 |
| **Total** | **~$16/mes** |
