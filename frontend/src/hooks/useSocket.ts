import { useEffect, useRef, useCallback } from 'react'
import type { Socket } from 'socket.io-client'
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'

export function useSocket() {
  const token = useAuthStore((s) => s.token)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!token) return

    const s = connectSocket(token)
    socketRef.current = s

    return () => {
      disconnectSocket()
      socketRef.current = null
    }
  }, [token])

  const emit = useCallback(<T>(event: string, payload?: unknown): Promise<T> => {
    return new Promise((resolve, reject) => {
      const s = socketRef.current ?? getSocket()
      if (!s.connected) {
        reject(new Error('Socket no conectado'))
        return
      }
      if (payload !== undefined) {
        s.emit(event, payload, (res: T) => resolve(res))
      } else {
        s.emit(event, (res: T) => resolve(res))
      }
    })
  }, [])

  const on = useCallback(<T>(event: string, handler: (data: T) => void) => {
    const s = socketRef.current ?? getSocket()
    s.on(event, handler as (...args: unknown[]) => void)
    return () => { s.off(event, handler as (...args: unknown[]) => void) }
  }, [])

  return { socket: socketRef.current, emit, on, isConnected: socketRef.current?.connected ?? false }
}
