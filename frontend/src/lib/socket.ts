/**
 * Polling-based transport que emula la interfaz de Socket.IO.
 * Reemplaza WebSockets para funcionar en Hostinger compartido (PHP).
 *
 * emit(event, payload) → POST /api/game/{roomId}/action
 * on(event, handler)   → suscripción al bus de eventos (polling cada 2 s)
 */

import { apiFetch } from './api'

type Handler = (data: unknown) => void

class EventBus {
  private handlers = new Map<string, Set<Handler>>()

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(handler)
  }

  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler)
  }

  emit(event: string, data: unknown) {
    this.handlers.get(event)?.forEach((h) => h(data))
  }
}

export const eventBus = new EventBus()

// ─── Polling loop ────────────────────────────────────────────────────────────
let pollInterval: ReturnType<typeof setInterval> | null = null
let lastEventId   = 0
let currentRoomId = ''

export function startPolling(roomId: string) {
  if (pollInterval && currentRoomId === roomId) return
  stopPolling()
  currentRoomId = roomId
  lastEventId   = 0

  pollInterval = setInterval(async () => {
    try {
      const res = await apiFetch<{ events: { id: number; type: string; payload: unknown }[] }>(
        `/game/${roomId}/events?since=${lastEventId}`
      )
      for (const ev of res.events) {
        if (ev.id > lastEventId) lastEventId = ev.id
        eventBus.emit(ev.type, ev.payload)
      }
    } catch {
      // silencioso — red momentáneamente caída
    }
  }, 2000)
}

export function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  currentRoomId = ''
  lastEventId   = 0
}

// Compatibilidad con código que importaba connectSocket / disconnectSocket
export function connectSocket(_token: string) { /* no-op */ }
export function disconnectSocket() { stopPolling() }
export function getSocket() { return null }
