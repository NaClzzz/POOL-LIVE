import { createServer } from 'node:http'

import { fromNodeHeaders } from 'better-auth/node'
import { config } from 'dotenv'
import { Server, type Socket } from 'socket.io'

import type {
  RoomDissolveAcknowledgement,
  RoomPlaybackState,
  RoomRealtimeChatMessage,
  RoomSettingsAcknowledgement,
  RoomSocketSnapshot,
  RoomSwitchRequired,
  UserRoomPlaylistItem,
} from '../src/types/room'

// 独立 Node 进程不会自动读取 Next.js 的 .env.local，因此必须先加载环境变量。
config({ path: '.env.local' })

const port = Number(process.env.SOCKET_PORT ?? 3001)

// 用于 room:join 事件接收浏览器提交的房间号和可选密码。
type JoinRoomPayload = {
  roomCode?: unknown
  password?: unknown
}

// 用于 room:join 确认回调，让浏览器区分成功状态和可展示的失败原因。
type JoinRoomAcknowledgement =
  | {
      ok: true
      snapshot: RoomSocketSnapshot
      messages: RoomRealtimeChatMessage[]
      myPlaylist: UserRoomPlaylistItem[]
      playback: RoomPlaybackState
    }
  | {
      ok: false
      message: string
      code?: RoomSwitchRequired['code']
      currentRoomCode?: string
    }

// 用于 room:leave 确认回调，客户端无需拿到额外房间数据。
type LeaveRoomAcknowledgement = {
  ok: true
}

// 用于 chat:send 事件接收未经信任的聊天文本。
type ChatMessagePayload = {
  content?: unknown
}

// 用于 chat:send 确认回调，让发送失败时保留输入框内容。
type ChatMessageAcknowledgement =
  | { ok: true }
  | {
      ok: false
      message: string
    }

// 用于 stage:leave 事件接收目标成员；省略时代表用户让自己下台。
type StageLeavePayload = {
  memberId?: unknown
}

// 用于 stage:join 与 stage:leave 确认回调，返回最新的房间快照。
type StageActionAcknowledgement =
  | {
      ok: true
      snapshot: RoomSocketSnapshot
    }
  | {
      ok: false
      message: string
    }

// 用于 room:playlist:add 事件接收客户端搜索结果中的歌曲元数据。
type PlaylistSongPayload = {
  song?: unknown
}

// 用于房间歌单修改事件返回最新的用户全局歌单。
type PlaylistAcknowledgement =
  | { ok: true; playlist: UserRoomPlaylistItem[] }
  | { ok: false; message: string }

// 用于 room:playlist:remove 事件接收歌单项 ID。
type PlaylistItemPayload = {
  itemId?: unknown
}

// 用于 room:playlist:reorder 事件接收目标位置。
type PlaylistReorderPayload = {
  itemId?: unknown
  toIndex?: unknown
}

// 用于房间播放错误、当前播放者切歌和投票切歌事件返回服务端处理后的播放状态。
type PlaybackAcknowledgement =
  | { ok: true; playback: RoomPlaybackState }
  | { ok: false; message: string }

// 用于保存已由 Better Auth Cookie 验证过的 Socket 用户身份。
type AuthenticatedUser = {
  id: string
  name: string
  email: string
}

// Socket.IO 挂载在原生 HTTP Server 上，/health 用来确认独立服务是否存活。
const httpServer = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ ok: true }))
    return
  }

  response.writeHead(404)
  response.end('Not Found')
})

function getPayloadPassword(value: unknown) {
  return typeof value === 'string' ? value : null
}

async function startSocketServer() {
  // 这些模块依赖 DATABASE_URL，必须在 dotenv 加载之后再导入。
  const [
    { auth },
    {
      RoomChatError,
      RoomJoinError,
      RoomPlaylistError,
      RoomPlaybackError,
      RoomPresenceService,
      RoomSettingsError,
      RoomStageError,
      normalizeRoomCode,
    },
  ] = await Promise.all([import('../src/lib/auth-core'), import('./room-presence-service')])
  const roomPresence = new RoomPresenceService()

  // Socket 重启会清空内存在线状态，因此同时修正数据库遗留的在线人数和成员记录。
  await roomPresence.resetPersistedPresence()

  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      credentials: true,
    },
  })

  roomPresence.setPlaybackChangedHandler((roomCode, playback) => {
    io.to(`room:${roomCode}`).emit('room:playback', playback)
  })
  roomPresence.setPlaylistChangedHandler((userId, playlist) => {
    io.to(`user:${userId}`).emit('user:room-playlist', playlist)
  })

  // 浏览器会通过 withCredentials 自动带上 Better Auth Cookie。
  // 后续事件只使用 socket.data.user，绝不信任客户端提交的 userId 或房主身份。
  io.use(async (socket, next) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(socket.request.headers),
      })

      if (!session?.user) {
        next(new Error('UNAUTHORIZED'))
        return
      }

      socket.data.user = {
        id: session.user.id,
        name: session.user.name ?? session.user.email,
        email: session.user.email,
      } satisfies AuthenticatedUser
      next()
    } catch (error) {
      // 不记录 Cookie 或完整请求头，避免会话凭据进入日志。
      console.error('[Socket] 会话验证服务不可用。', error)
      next(new Error('AUTH_UNAVAILABLE'))
    }
  })

  async function leaveCurrentRoom(socket: Socket, user: AuthenticatedUser) {
    const roomCode = socket.data.roomCode
    if (typeof roomCode !== 'string') return

    delete socket.data.roomCode
    const socketRoomName = `room:${roomCode}`
    socket.leave(socketRoomName)

    const snapshot = await roomPresence.leaveRoom({
      roomCode,
      userId: user.id,
      socketId: socket.id,
    })

    if (snapshot) io.to(socketRoomName).emit('room:presence', snapshot)
  }

  async function forceSwitchUserRoom(user: AuthenticatedUser, targetRoomCode: string) {
    const previousRoomCode = await roomPresence.getActiveRoomCode(user.id)
    if (!previousRoomCode || previousRoomCode === targetRoomCode) return

    const sockets = await io.in(`user:${user.id}`).fetchSockets()
    const snapshot = await roomPresence.forceLeaveUser({
      roomCode: previousRoomCode,
      userId: user.id,
    })

    if (snapshot) io.to(`room:${previousRoomCode}`).emit('room:presence', snapshot)

    for (const previousSocket of sockets) {
      if (previousSocket.data.roomCode !== previousRoomCode) continue

      previousSocket.leave(`room:${previousRoomCode}`)
      delete previousSocket.data.roomCode
      previousSocket.emit('room:forced-leave', { roomCode: previousRoomCode })
    }
  }

  async function joinSocketRoom(
    socket: Socket,
    user: AuthenticatedUser,
    payload: JoinRoomPayload,
    acknowledge: ((result: JoinRoomAcknowledgement) => void) | undefined,
    allowSwitch: boolean,
  ) {
    const roomCode = normalizeRoomCode(payload?.roomCode)

    if (!roomCode) {
      acknowledge?.({ ok: false, message: '房间号格式不正确。' })
      return
    }

    try {
      const activeRoomCode = await roomPresence.getActiveRoomCode(user.id)
      if (activeRoomCode && activeRoomCode !== roomCode) {
        if (!allowSwitch) {
          acknowledge?.({
            ok: false,
            message: `你已在房间 ${activeRoomCode} 中，请确认后再切换。`,
            code: 'ALREADY_IN_ROOM',
            currentRoomCode: activeRoomCode,
          })
          return
        }

        await forceSwitchUserRoom(user, roomCode)
      }

      const previousRoomCode = socket.data.roomCode
      if (typeof previousRoomCode === 'string' && previousRoomCode !== roomCode) {
        await leaveCurrentRoom(socket, user)
      }

      const joinedRoom = await roomPresence.joinRoom({
        roomCode,
        password: getPayloadPassword(payload?.password),
        user,
        socketId: socket.id,
      })
      const socketRoomName = `room:${roomCode}`

      socket.join(socketRoomName)
      socket.data.roomCode = roomCode
      acknowledge?.({ ok: true, ...joinedRoom })
      io.to(socketRoomName).emit('room:presence', joinedRoom.snapshot)
      console.log(`[Socket] ${user.id} 已加入 ${socketRoomName}，当前 ${joinedRoom.snapshot.room.memberCount} 人`)
    } catch (error) {
      if (allowSwitch && error instanceof RoomJoinError && error.code === 'ALREADY_IN_ROOM') {
        const currentRoomCode = error.currentRoomCode
        if (currentRoomCode) {
          await forceSwitchUserRoom(user, roomCode)
          return joinSocketRoom(socket, user, payload, acknowledge, false)
        }
      }

      const message = error instanceof RoomJoinError ? error.message : '加入房间失败，请稍后重试。'

      if (!(error instanceof RoomJoinError)) {
        console.error(`[Socket] 加入房间 ${roomCode} 失败。`, error)
      }

      acknowledge?.({
        ok: false,
        message,
        ...(error instanceof RoomJoinError && error.code
          ? { code: error.code, currentRoomCode: error.currentRoomCode }
          : {}),
      })
    }
  }

  io.on('connection', socket => {
    const user = socket.data.user as AuthenticatedUser | undefined

    // 中间件已经处理，这里额外防止将来配置调整时遗漏保护。
    if (!user) {
      socket.disconnect(true)
      return
    }

    socket.join(`user:${user.id}`)
    console.log(`[Socket] 用户已连接：${user.id} (${socket.id})`)

    socket.on(
      'room:join',
      async (payload: JoinRoomPayload, acknowledge?: (result: JoinRoomAcknowledgement) => void) => {
        await joinSocketRoom(socket, user, payload, acknowledge, false)
      },
    )

    socket.on(
      'room:switch',
      async (payload: JoinRoomPayload, acknowledge?: (result: JoinRoomAcknowledgement) => void) => {
        await joinSocketRoom(socket, user, payload, acknowledge, true)
      },
    )

    socket.on(
      'chat:send',
      async (
        payload: ChatMessagePayload,
        acknowledge?: (result: ChatMessageAcknowledgement) => void,
      ) => {
        const roomCode = socket.data.roomCode

        if (typeof roomCode !== 'string') {
          acknowledge?.({ ok: false, message: '请先加入房间后再发送消息。' })
          return
        }

        try {
          const message = await roomPresence.sendMessage({
            roomCode,
            socketId: socket.id,
            user,
            content: payload?.content,
          })

          io.to(`room:${roomCode}`).emit('chat:message', message)
          acknowledge?.({ ok: true })
        } catch (error) {
          const message =
            error instanceof RoomChatError ? error.message : '发送消息失败，请稍后重试。'

          if (!(error instanceof RoomChatError)) {
            console.error(`[Socket] 用户 ${user.id} 发送消息失败。`, error)
          }

          acknowledge?.({ ok: false, message })
        }
      },
    )

    socket.on('stage:join', async (acknowledge?: (result: StageActionAcknowledgement) => void) => {
      const roomCode = socket.data.roomCode

      if (typeof roomCode !== 'string') {
        acknowledge?.({ ok: false, message: '请先加入房间后再上台。' })
        return
      }

      try {
        const snapshot = await roomPresence.joinStage({
          roomCode,
          userId: user.id,
          socketId: socket.id,
        })

        acknowledge?.({ ok: true, snapshot })
        io.to(`room:${roomCode}`).emit('room:presence', snapshot)
      } catch (error) {
        const message = error instanceof RoomStageError ? error.message : '上台失败，请稍后重试。'

        if (!(error instanceof RoomStageError)) {
          console.error(`[Socket] 用户 ${user.id} 上台失败。`, error)
        }

        acknowledge?.({ ok: false, message })
      }
    })

    socket.on(
      'stage:leave',
      async (
        payload: StageLeavePayload,
        acknowledge?: (result: StageActionAcknowledgement) => void,
      ) => {
        const roomCode = socket.data.roomCode
        const targetUserId = typeof payload?.memberId === 'string' ? payload.memberId : user.id

        if (typeof roomCode !== 'string') {
          acknowledge?.({ ok: false, message: '请先加入房间后再操作上台队列。' })
          return
        }

        try {
          const snapshot = await roomPresence.leaveStage({
            roomCode,
            requesterUserId: user.id,
            requesterSocketId: socket.id,
            targetUserId,
          })

          acknowledge?.({ ok: true, snapshot })
          io.to(`room:${roomCode}`).emit('room:presence', snapshot)
        } catch (error) {
          const message =
            error instanceof RoomStageError ? error.message : '下台失败，请稍后重试。'

          if (!(error instanceof RoomStageError)) {
            console.error(`[Socket] 用户 ${user.id} 操作下台失败。`, error)
          }

          acknowledge?.({ ok: false, message })
        }
      },
    )

    socket.on(
      'room:update-settings',
      async (
        payload: unknown,
        acknowledge?: (result: RoomSettingsAcknowledgement) => void,
      ) => {
        const roomCode = socket.data.roomCode
        if (typeof roomCode !== 'string') {
          acknowledge?.({ ok: false, message: '请先加入房间后再修改设置。' })
          return
        }

        try {
          const snapshot = await roomPresence.updateRoomSettings({
            roomCode,
            userId: user.id,
            socketId: socket.id,
            payload,
          })

          acknowledge?.({ ok: true, snapshot })
          io.to(`room:${roomCode}`).emit('room:presence', snapshot)
        } catch (error) {
          const message = error instanceof RoomSettingsError ? error.message : '保存房间设置失败，请稍后重试。'
          if (!(error instanceof RoomSettingsError)) {
            console.error(`[Socket] 用户 ${user.id} 修改房间设置失败。`, error)
          }
          acknowledge?.({ ok: false, message })
        }
      },
    )

    socket.on(
      'room:dissolve',
      async (acknowledge?: (result: RoomDissolveAcknowledgement) => void) => {
        const roomCode = socket.data.roomCode
        if (typeof roomCode !== 'string') {
          acknowledge?.({ ok: false, message: '请先加入房间后再解散房间。' })
          return
        }

        try {
          const roomSockets = await io.in(`room:${roomCode}`).fetchSockets()
          await roomPresence.dissolveRoom({
            roomCode,
            userId: user.id,
            socketId: socket.id,
          })

          acknowledge?.({ ok: true })
          io.to(`room:${roomCode}`).emit('room:dissolved', { roomCode })

          for (const roomSocket of roomSockets) {
            await roomSocket.leave(`room:${roomCode}`)
            delete roomSocket.data.roomCode
          }
        } catch (error) {
          const message = error instanceof RoomSettingsError ? error.message : '解散房间失败，请稍后重试。'
          if (!(error instanceof RoomSettingsError)) {
            console.error(`[Socket] 用户 ${user.id} 解散房间失败。`, error)
          }
          acknowledge?.({ ok: false, message })
        }
      },
    )

    socket.on(
      'room:playlist:add',
      async (payload: PlaylistSongPayload, acknowledge?: (result: PlaylistAcknowledgement) => void) => {
        const roomCode = socket.data.roomCode
        if (typeof roomCode !== 'string') {
          acknowledge?.({ ok: false, message: '请先加入房间后再添加歌曲。' })
          return
        }

        try {
          const playlist = await roomPresence.addPlaylistSong({
            roomCode,
            userId: user.id,
            socketId: socket.id,
            song: payload?.song,
          })
          acknowledge?.({ ok: true, playlist })
        } catch (error) {
          const message = error instanceof RoomPlaylistError ? error.message : '添加歌曲失败，请稍后重试。'
          if (!(error instanceof RoomPlaylistError)) console.error('[Socket] 添加房间歌单歌曲失败。', error)
          acknowledge?.({ ok: false, message })
        }
      },
    )

    socket.on(
      'room:playlist:remove',
      async (payload: PlaylistItemPayload, acknowledge?: (result: PlaylistAcknowledgement) => void) => {
        const roomCode = socket.data.roomCode
        if (typeof roomCode !== 'string') {
          acknowledge?.({ ok: false, message: '请先加入房间后再移除歌曲。' })
          return
        }

        try {
          const playlist = await roomPresence.removePlaylistSong({
            roomCode,
            userId: user.id,
            socketId: socket.id,
            itemId: payload?.itemId,
          })
          acknowledge?.({ ok: true, playlist })
        } catch (error) {
          const message = error instanceof RoomPlaylistError ? error.message : '移除歌曲失败，请稍后重试。'
          if (!(error instanceof RoomPlaylistError)) console.error('[Socket] 移除房间歌单歌曲失败。', error)
          acknowledge?.({ ok: false, message })
        }
      },
    )

    socket.on(
      'room:playlist:reorder',
      async (
        payload: PlaylistReorderPayload,
        acknowledge?: (result: PlaylistAcknowledgement) => void,
      ) => {
        const roomCode = socket.data.roomCode
        if (typeof roomCode !== 'string') {
          acknowledge?.({ ok: false, message: '请先加入房间后再排序歌曲。' })
          return
        }

        try {
          const playlist = await roomPresence.reorderPlaylistSong({
            roomCode,
            userId: user.id,
            socketId: socket.id,
            itemId: payload?.itemId,
            toIndex: payload?.toIndex,
          })
          acknowledge?.({ ok: true, playlist })
        } catch (error) {
          const message = error instanceof RoomPlaylistError ? error.message : '排序歌曲失败，请稍后重试。'
          if (!(error instanceof RoomPlaylistError)) console.error('[Socket] 排序房间歌单失败。', error)
          acknowledge?.({ ok: false, message })
        }
      },
    )

    for (const eventName of ['shuffle', 'import-liked', 'clear'] as const) {
      socket.on(
        `room:playlist:${eventName}`,
        async (acknowledge?: (result: PlaylistAcknowledgement) => void) => {
          const roomCode = socket.data.roomCode
          if (typeof roomCode !== 'string') {
            acknowledge?.({ ok: false, message: '请先加入房间后再修改歌单。' })
            return
          }

          try {
            const playlist =
              eventName === 'shuffle'
                ? await roomPresence.shufflePlaylist({ roomCode, userId: user.id, socketId: socket.id })
                : eventName === 'import-liked'
                  ? await roomPresence.importLikedPlaylist({ roomCode, userId: user.id, socketId: socket.id })
                  : await roomPresence.clearPlaylist({ roomCode, userId: user.id, socketId: socket.id })

            acknowledge?.({ ok: true, playlist })
          } catch (error) {
            const message = error instanceof RoomPlaylistError ? error.message : '修改歌单失败，请稍后重试。'
            if (!(error instanceof RoomPlaylistError)) console.error(`[Socket] ${eventName} 房间歌单操作失败。`, error)
            acknowledge?.({ ok: false, message })
          }
        },
      )
    }

    socket.on(
      'room:playback:skip',
      async (acknowledge?: (result: PlaybackAcknowledgement) => void) => {
        const roomCode = socket.data.roomCode
        if (typeof roomCode !== 'string') {
          acknowledge?.({ ok: false, message: '请先加入房间后再切歌。' })
          return
        }

        try {
          const playback = await roomPresence.skipCurrentPlayback({
            roomCode,
            userId: user.id,
            socketId: socket.id,
          })
          acknowledge?.({ ok: true, playback })
        } catch (error) {
          const message = error instanceof RoomPlaybackError ? error.message : '切歌失败，请稍后重试。'
          if (!(error instanceof RoomPlaybackError)) console.error('[Socket] 房间切歌失败。', error)
          acknowledge?.({ ok: false, message })
        }
      },
    )

    socket.on(
      'room:playback:vote-skip',
      async (acknowledge?: (result: PlaybackAcknowledgement) => void) => {
        const roomCode = socket.data.roomCode
        if (typeof roomCode !== 'string') {
          acknowledge?.({ ok: false, message: '请先加入房间后再投票切歌。' })
          return
        }

        try {
          const playback = await roomPresence.voteSkipPlayback({
            roomCode,
            userId: user.id,
            socketId: socket.id,
          })
          acknowledge?.({ ok: true, playback })
        } catch (error) {
          const message = error instanceof RoomPlaybackError ? error.message : '投票切歌失败，请稍后重试。'
          if (!(error instanceof RoomPlaybackError)) console.error('[Socket] 房间投票切歌失败。', error)
          acknowledge?.({ ok: false, message })
        }
      },
    )

    socket.on(
      'room:playback:media-error',
      async (payload: unknown, acknowledge?: (result: PlaybackAcknowledgement) => void) => {
        const roomCode = socket.data.roomCode
        if (typeof roomCode !== 'string') {
          acknowledge?.({ ok: false, message: '请先加入房间后再上报播放错误。' })
          return
        }

        try {
          const playback = await roomPresence.reportPlaybackError({
            roomCode,
            userId: user.id,
            socketId: socket.id,
            payload,
          })
          acknowledge?.({ ok: true, playback })
        } catch (error) {
          const message = error instanceof RoomPlaybackError ? error.message : '处理播放错误失败，请稍后重试。'
          if (!(error instanceof RoomPlaybackError)) console.error('[Socket] 处理房间播放错误失败。', error)
          acknowledge?.({ ok: false, message })
        }
      },
    )

    socket.on('room:leave', async (acknowledge?: (result: LeaveRoomAcknowledgement) => void) => {
      try {
        await leaveCurrentRoom(socket, user)
        acknowledge?.({ ok: true })
      } catch (error) {
        console.error(`[Socket] 用户 ${user.id} 离开房间失败。`, error)
        acknowledge?.({ ok: true })
      }
    })

    socket.on('disconnect', reason => {
      void leaveCurrentRoom(socket, user).catch(error => {
        console.error(`[Socket] 用户 ${user.id} 断线清理失败。`, error)
      })
      console.log(`[Socket] 用户已断开：${user.id} (${socket.id})，原因：${reason}`)
    })
  })

  httpServer.listen(port, () => {
    console.log(`[Socket] 服务已启动：http://localhost:${port}`)
  })
}

void startSocketServer().catch(error => {
  console.error('[Socket] 服务启动失败。', error)
  process.exitCode = 1
})
