import { useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/api'
import { eventBus, startPolling, stopPolling } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useRoomStore } from '@/stores/room.store'

/**
 * Reemplaza el hook de Socket.IO por HTTP polling + REST.
 * La interfaz (emit / on) es idéntica para no cambiar los componentes de juego.
 */
export function useSocket() {
  const token  = useAuthStore((s) => s.token)
  const roomId = useRoomStore((s) => s.roomId)

  useEffect(() => {
    if (!token || !roomId) return
    startPolling(roomId)
    return () => stopPolling()
  }, [token, roomId])

  /** Envía un evento al backend y devuelve la respuesta */
  const emit = useCallback(
    <T>(event: string, payload?: unknown): Promise<T> => {
      const rid = useRoomStore.getState().roomId
      if (!rid) return Promise.reject(new Error('Sin sala activa'))
      return apiFetch<T>(`/game/${rid}/action`, {
        method: 'POST',
        body: JSON.stringify({ event, payload }),
      })
    },
    []
  )

  /** Suscribe a eventos del bus local (alimentado por el polling) */
  const on = useCallback(<T>(event: string, handler: (data: T) => void) => {
    const h = (data: unknown) => handler(data as T)
    eventBus.on(event, h)
    return () => eventBus.off(event, h)
  }, [])

  return {
    socket: null,
    emit,
    on,
    isConnected: !!roomId,
  }
}
