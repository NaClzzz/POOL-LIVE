import 'client-only'

import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket() {
  if (socket) return socket

  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001'

  socket = io(socketUrl, {
    // Only connect after the user enters a room page.
    autoConnect: false,
    // Required later when the Socket server reads the Better Auth session cookie.
    withCredentials: true,
  })

  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
