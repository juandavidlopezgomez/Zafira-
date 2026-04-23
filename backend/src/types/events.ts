// ============================================================
// BattleFlirt — Contrato completo de eventos Socket.io
// Formato: {modulo}:{accion}  (Regla 10)
// ============================================================

// ────────────────────────────────────────────────────────────
// TIPOS BASE
// ────────────────────────────────────────────────────────────

export interface WsResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export type GameMode =
  | 'bottle'
  | 'truth-dare'
  | 'battle-1v1'
  | 'liga'
  | 'juicio'
  | 'oscuro'
  | 'cartas'
  | 'termometro'
  | 'actores'
  | 'ultimo-pie'
  | 'todo-nada';

export type HiloType = 'directo' | 'secreto' | 'anonimo' | 'ardiente';
export type TensionLevel = 1 | 2 | 3 | 4 | 5;

export type ArenaFeature =
  | 'el_estadio'
  | 'silla_caliente'
  | 'sobre_rojo'
  | 'corona_semanal'
  | 'quien_en_tu_curso'
  | 'termometro_colegio'
  | 'momento_epico'
  | 'ruleta_maldita'
  | 'el_shipper';

// ────────────────────────────────────────────────────────────
// ROOM — namespace principal
// ────────────────────────────────────────────────────────────

export interface RoomJoinPayload {
  code: string;
}

export interface RoomStatePayload {
  roomId: string;
  players: { id: string; username: string; avatarUrl?: string }[];
  mode: GameMode;
  status: 'waiting' | 'active' | 'finished';
}

export interface ServerToClientEvents {
  // Room
  'room:joined':    (data: RoomStatePayload) => void;
  'room:left':      (data: { userId: string }) => void;
  'room:player_joined': (data: { userId: string; username: string }) => void;
  'room:player_left':   (data: { userId: string }) => void;
  'room:error':     (data: { message: string }) => void;

  // Game — genéricos
  'game:started':   (data: { sessionId: string; mode: GameMode }) => void;
  'game:turn':      (data: { playerId: string; round: number }) => void;
  'game:challenge': (data: { id: string; text: string; intensity: number }) => void;
  'game:finished':  (data: { matches: { fromId: string; toId: string }[] }) => void;

  // Bottle
  'bottle:spin':    (data: { targetId: string; targetName: string }) => void;

  // Truth-Dare
  'truth_dare:choice_made': (data: { playerId: string; choice: 'truth' | 'dare' }) => void;

  // Battle 1v1
  'battle_1v1:round_result': (data: { winnerId: string; votes: Record<string, number> }) => void;

  // El Juicio
  'juicio:verdict': (data: { accusedId: string; guilty: boolean; votes: number }) => void;

  // Termómetro Humano
  'termometro:position': (data: { userId: string; rank: number; total: number }) => void;

  // LLAMAS
  'llamas:earned':  (data: { userId: string; amount: number; reason: string; newBalance: number }) => void;

  // Arena
  'arena:feature_started': (data: { feature: ArenaFeature; stadiumId: string }) => void;
  'arena:vote_counted':    (data: { stadiumId: string; targetId: string; count: number }) => void;
  'arena:result':          (data: { stadiumId: string; winnerId?: string; payload: unknown }) => void;

  // Hilo — namespace /hilo
  'hilo:message':          (data: HiloMessageEvent) => void;
  'hilo:tension_changed':  (data: { hiloId: string; level: TensionLevel }) => void;
  'hilo:reaction':         (data: { messageId: string; reaction: string }) => void;
  'hilo:moderation_block': (data: { messageId: string }) => void;
}

export interface ClientToServerEvents {
  // Room
  'room:join':  (payload: RoomJoinPayload, cb: (res: WsResponse<RoomStatePayload>) => void) => void;
  'room:leave': (cb: (res: WsResponse) => void) => void;

  // Game
  'game:ready':          (cb: (res: WsResponse) => void) => void;
  'game:mark_interest':  (payload: { targetId: string }) => void;

  // Bottle
  'bottle:spin': (cb: (res: WsResponse) => void) => void;

  // Truth-Dare
  'truth_dare:choose': (payload: { choice: 'truth' | 'dare' }, cb: (res: WsResponse) => void) => void;
  'truth_dare:complete': (cb: (res: WsResponse) => void) => void;

  // Battle 1v1
  'battle_1v1:vote': (payload: { targetId: string }, cb: (res: WsResponse) => void) => void;

  // El Juicio
  'juicio:vote': (payload: { guilty: boolean }, cb: (res: WsResponse) => void) => void;

  // Arena
  'arena:start_feature': (payload: { feature: ArenaFeature }, cb: (res: WsResponse) => void) => void;
  'arena:vote':          (payload: { stadiumId: string; targetId: string; voteType: string }, cb: (res: WsResponse) => void) => void;

  // Hilo
  'hilo:send_message': (payload: HiloSendPayload, cb: (res: WsResponse) => void) => void;
  'hilo:react':        (payload: { messageId: string; reaction: string }) => void;
}

// ────────────────────────────────────────────────────────────
// HILO — payloads específicos
// ────────────────────────────────────────────────────────────

export interface HiloSendPayload {
  hiloId: string;
  content: string;
}

export interface HiloMessageEvent {
  id: string;
  hiloId: string;
  // Regla 8: solo aliasId en modo anónimo, nunca userId
  userId?: string;
  aliasId?: string;
  username?: string;
  content: string;
  tension: TensionLevel;
  createdAt: string;
}

// ────────────────────────────────────────────────────────────
// INTER-SOCKET DATA — datos en socket.data (autenticado)
// ────────────────────────────────────────────────────────────

export interface SocketData {
  userId: string;
  username: string;
  isPremium: boolean;
  roomId?: string;
}
