import { io, Socket } from 'socket.io-client'

// Tipado reutilizado desde el backend (copiado para evitar dependencia de monorepo)
// En producción: extraer a paquete @battleflirt/types compartido

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL ?? window.location.origin, {
      autoConnect: false,
      withCredentials: true,
    })
  }
  return socket
}

export function connectSocket(token: string): Socket {
  const s = getSocket()
  s.auth = { token }
  s.connect()
  return s
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
}
