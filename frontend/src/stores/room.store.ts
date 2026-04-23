import { create } from 'zustand'

export type GameMode =
  | 'bottle' | 'truth-dare' | 'battle-1v1' | 'liga'
  | 'juicio' | 'oscuro' | 'cartas' | 'termometro'
  | 'actores' | 'ultimo-pie' | 'todo-nada'

interface Player {
  id: string
  username: string
  avatarUrl?: string
  llamasBalance: number
  isPremium: boolean
}

interface RoomState {
  roomId: string | null
  code: string | null
  mode: GameMode | null
  status: 'waiting' | 'active' | 'finished'
  players: Player[]
  sessionId: string | null
  isConnecting: boolean
  error: string | null

  setRoom: (roomId: string, code: string, mode: GameMode) => void
  setPlayers: (players: Player[]) => void
  addPlayer: (player: Player) => void
  removePlayer: (playerId: string) => void
  setStatus: (status: RoomState['status']) => void
  setSessionId: (id: string) => void
  setConnecting: (v: boolean) => void
  setError: (msg: string | null) => void
  reset: () => void
}

export const useRoomStore = create<RoomState>()((set) => ({
  roomId: null,
  code: null,
  mode: null,
  status: 'waiting',
  players: [],
  sessionId: null,
  isConnecting: false,
  error: null,

  setRoom:      (roomId, code, mode) => set({ roomId, code, mode }),
  setPlayers:   (players) => set({ players }),
  addPlayer:    (player) => set((s) => ({ players: [...s.players, player] })),
  removePlayer: (id) => set((s) => ({ players: s.players.filter((p) => p.id !== id) })),
  setStatus:    (status) => set({ status }),
  setSessionId: (sessionId) => set({ sessionId }),
  setConnecting:(isConnecting) => set({ isConnecting }),
  setError:     (error) => set({ error }),
  reset:        () => set({ roomId: null, code: null, mode: null, status: 'waiting', players: [], sessionId: null }),
}))
