'use client'

import { ArrowLeftOutlined, CrownOutlined, LockOutlined, TeamOutlined } from '@ant-design/icons'
import { Alert, Avatar, Button, Card, Input, Tag, Typography } from 'antd'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useSession } from '@/lib/auth-client'
import { getSocket } from '@/lib/socket-client'
import { useRoomRealtimeStore } from '@/store/room-realtime-store'
import type {
  RoomPlaybackState,
  RoomRealtimeChatMessage,
  RoomSocketSnapshot,
  RoomSwitchRequired,
  UserRoomPlaylistItem,
} from '@/types/room'

// 用于接收 room:join 和 room:switch 的完整服务端房间快照。
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

// 用于接收上台和下台操作后的最新成员快照。
type StageActionAcknowledgement =
  | {
      ok: true
      snapshot: RoomSocketSnapshot
    }
  | {
      ok: false
      message: string
    }

// 用于 room:forced-leave 事件标识用户被切换到其他房间。
type ForcedLeavePayload = {
  roomCode?: string
}

function getPasswordStorageKey(roomCode: string) {
  return `pool-room-password:${roomCode.toLowerCase()}`
}

function getStoredRoomPassword(roomCode: string) {
  return sessionStorage.getItem(getPasswordStorageKey(roomCode)) ?? ''
}

function saveRoomPassword(roomCode: string, password: string) {
  const key = getPasswordStorageKey(roomCode)
  if (password) {
    sessionStorage.setItem(key, password)
    return
  }

  sessionStorage.removeItem(key)
}

function avatarColor(id: string) {
  const colors = ['#42a5f5', '#7ec8b6', '#9ba8f5', '#f0a85b', '#db8acd']
  let value = 0
  for (const character of id) value = (value * 31 + character.charCodeAt(0)) >>> 0
  return colors[value % colors.length]
}

export default function RoomPage() {
  const params = useParams<{ roomCode: string }>()
  const router = useRouter()
  const roomCode = typeof params.roomCode === 'string' ? params.roomCode.toLowerCase() : ''
  const { data: session } = useSession()
  const storedRoomCode = useRoomRealtimeStore(state => state.roomCode)
  const snapshot = useRoomRealtimeStore(state => state.snapshot)
  const playback = useRoomRealtimeStore(state => state.playback)
  const connectionState = useRoomRealtimeStore(state => state.connectionState)
  const setJoinedRoom = useRoomRealtimeStore(state => state.setJoinedRoom)
  const setPresence = useRoomRealtimeStore(state => state.setPresence)
  const appendMessage = useRoomRealtimeStore(state => state.appendMessage)
  const setPlaylist = useRoomRealtimeStore(state => state.setPlaylist)
  const setPlayback = useRoomRealtimeStore(state => state.setPlayback)
  const setConnectionState = useRoomRealtimeStore(state => state.setConnectionState)
  const clearRoom = useRoomRealtimeStore(state => state.clearRoom)
  const [socketError, setSocketError] = useState<string | null>(null)
  const [stageError, setStageError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [joinAttempt, setJoinAttempt] = useState(0)

  useEffect(() => {
    if (!roomCode) return

    const socket = getSocket()
    let isCurrent = true

    function applyPresence(nextSnapshot: RoomSocketSnapshot) {
      if (!isCurrent || nextSnapshot.room.code !== roomCode) return
      setPresence(roomCode, nextSnapshot)
      setSocketError(null)
    }

    function applyPlayback(nextPlayback: RoomPlaybackState) {
      if (!isCurrent) return
      setPlayback(roomCode, nextPlayback)
    }

    function applyPlaylist(nextPlaylist: UserRoomPlaylistItem[]) {
      if (!isCurrent) return
      setPlaylist(nextPlaylist)
    }

    function handleJoined(result: JoinRoomAcknowledgement) {
      if (!isCurrent) return

      if (!result.ok) {
        if (result.code === 'ALREADY_IN_ROOM' && result.currentRoomCode) {
          const shouldSwitch = window.confirm(
            `你正在房间 ${result.currentRoomCode} 中。确认后会自动退出旧房间并进入当前房间。`,
          )
          if (shouldSwitch) {
            socket.emit(
              'room:switch',
              { roomCode, password: getStoredRoomPassword(roomCode) || undefined },
              handleJoined,
            )
            return
          }
        }

        setSocketError(result.message)
        setConnectionState('error', result.message)
        return
      }

      setJoinedRoom(roomCode, result.snapshot, result.messages, result.myPlaylist, result.playback)
      setSocketError(null)
      setConnectionState('joined')
    }

    function joinRoom() {
      setConnectionState('connecting')
      socket.emit(
        'room:join',
        { roomCode, password: getStoredRoomPassword(roomCode) || undefined },
        handleJoined,
      )
    }

    function handleConnect() {
      joinRoom()
    }

    function handleChatMessage(message: RoomRealtimeChatMessage) {
      if (isCurrent) appendMessage(roomCode, message)
    }

    function handleForcedLeave(payload: ForcedLeavePayload) {
      if (!isCurrent || payload.roomCode !== roomCode) return
      clearRoom(roomCode)
      router.replace('/rooms')
    }

    function handleConnectError(error: Error) {
      if (!isCurrent) return

      const message =
        error.message === 'UNAUTHORIZED'
          ? '登录状态已失效，请重新登录后再加入房间。'
          : error.message === 'AUTH_UNAVAILABLE'
            ? '身份验证服务暂时不可用，请稍后重试。'
            : '实时服务连接失败，请确认 Socket 服务正在运行。'

      setSocketError(message)
      setConnectionState('error', message)
      if (error.message === 'UNAUTHORIZED') socket.disconnect()
    }

    function handleDisconnect() {
      if (isCurrent) setConnectionState('connecting')
    }

    socket.on('connect', handleConnect)
    socket.on('room:presence', applyPresence)
    socket.on('room:playback', applyPlayback)
    socket.on('user:room-playlist', applyPlaylist)
    socket.on('chat:message', handleChatMessage)
    socket.on('room:forced-leave', handleForcedLeave)
    socket.on('connect_error', handleConnectError)
    socket.on('disconnect', handleDisconnect)

    if (socket.connected) joinRoom()
    else socket.connect()

    return () => {
      isCurrent = false
      socket.emit('room:leave')
      socket.off('connect', handleConnect)
      socket.off('room:presence', applyPresence)
      socket.off('room:playback', applyPlayback)
      socket.off('user:room-playlist', applyPlaylist)
      socket.off('chat:message', handleChatMessage)
      socket.off('room:forced-leave', handleForcedLeave)
      socket.off('connect_error', handleConnectError)
      socket.off('disconnect', handleDisconnect)
      socket.disconnect()
    }
  }, [
    appendMessage,
    clearRoom,
    joinAttempt,
    roomCode,
    router,
    setConnectionState,
    setJoinedRoom,
    setPlayback,
    setPlaylist,
    setPresence,
  ])

  const room = storedRoomCode === roomCode ? (snapshot?.room ?? null) : null
  const members = room ? (snapshot?.members ?? []) : []
  const stageMembers = room ? (snapshot?.stageMembers ?? []) : []
  const owner = members.find(member => member.isOwner)
  const currentUserId = session?.user.id
  const isCurrentUserHost = owner?.id === currentUserId
  const hasJoinedStage = Boolean(currentUserId && stageMembers.some(member => member.id === currentUserId))
  const needsPassword = Boolean(socketError?.includes('密码'))
  const activeMemberId = playback?.activeMemberId

  function retryJoinWithPassword() {
    saveRoomPassword(roomCode, password)
    setSocketError(null)
    setJoinAttempt(previous => previous + 1)
  }

  function handleJoinStage() {
    const socket = getSocket()
    if (!room || !socket.connected) {
      setStageError('实时服务未连接，暂时不能上台。')
      return
    }

    socket.emit('stage:join', (result: StageActionAcknowledgement) => {
      if (!result.ok) {
        setStageError(result.message)
        return
      }

      setPresence(roomCode, result.snapshot)
      setStageError(null)
    })
  }

  function handleLeaveStage(memberId: string) {
    const socket = getSocket()
    if (!room || !socket.connected) {
      setStageError('实时服务未连接，暂时不能操作上台队列。')
      return
    }

    socket.emit('stage:leave', { memberId }, (result: StageActionAcknowledgement) => {
      if (!result.ok) {
        setStageError(result.message)
        return
      }

      setPresence(roomCode, result.snapshot)
      setStageError(null)
    })
  }

  return (
    <main className="desktop-page !flex !h-[calc(100vh-176px)] !min-h-0 !flex-col !overflow-hidden !px-12 !py-4">
      <header className="mb-3 flex shrink-0 items-center justify-between border-b border-[#dfe4e7] pb-3">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/rooms" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-[#71808a] hover:text-[#1e88e5]">
            <ArrowLeftOutlined />
            返回大厅
          </Link>
          <span className="h-4 w-px bg-[#dfe4e7]" />
          <div className="min-w-0">
            <p className="m-0 text-[10px] font-semibold tracking-[0.16em] text-[#1e88e5]">POOL LIVE ROOM</p>
            <h1 className="m-0 truncate text-2xl font-semibold tracking-[-0.03em] text-[#222a30]">
              {room?.name ?? '正在加入房间'}
            </h1>
          </div>
        </div>
        {room ? <span className="shrink-0 text-xs text-[#71808a]">房间号：{room.code}</span> : null}
      </header>

      {socketError ? (
        <Alert
          className="mb-3 shrink-0"
          type="error"
          showIcon
          message="无法加入房间"
          description={
            needsPassword ? (
              <div className="mt-3 flex max-w-[460px] gap-2">
                <Input.Password
                  value={password}
                  maxLength={64}
                  placeholder="输入房间密码"
                  onChange={event => setPassword(event.target.value)}
                  onPressEnter={retryJoinWithPassword}
                />
                <Button type="primary" disabled={!password} onClick={retryJoinWithPassword}>
                  重试
                </Button>
              </div>
            ) : (
              socketError
            )
          }
        />
      ) : null}

      {!room && !socketError ? (
        <Card className="shrink-0" styles={{ body: { padding: 20 } }}>
          <Typography.Text type="secondary">
            {connectionState === 'connecting' ? '正在连接实时服务并验证房间信息…' : '正在准备房间…'}
          </Typography.Text>
        </Card>
      ) : null}

      {room ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <Card className="shrink-0" styles={{ body: { padding: 18 } }}>
            <div className="flex items-center justify-between border-b border-[#edf0f2] pb-3">
              <div className="flex items-center gap-3">
                <Tag color="blue" className="!m-0">{room.tag}</Tag>
                {room.isPasswordProtected ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-[#71808a]"><LockOutlined />加密房间</span>
                ) : null}
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-[#71808a]"><TeamOutlined />{room.memberCount}/{room.maxMembers} 人在线</span>
            </div>
            <div className="mt-3 flex items-center gap-3 overflow-x-auto pb-1">
              <span className="shrink-0 text-xs font-semibold text-[#34454f]">在线成员</span>
              {members.map(member => (
                <div key={member.id} className="flex shrink-0 items-center gap-1.5">
                  <span className="relative block h-7 w-7">
                    <Avatar size={28} style={{ backgroundColor: avatarColor(member.id) }} className="!font-semibold !text-xs !text-white">{member.name.slice(0, 1)}</Avatar>
                    {member.isOwner ? <CrownOutlined className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 text-[9px] text-[#1e88e5]" /> : null}
                  </span>
                  <span className="max-w-20 truncate text-xs text-[#52616a]">{member.name}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="shrink-0" styles={{ body: { padding: 18 } }}>
            <div className="mb-3 flex items-center justify-between border-b border-[#edf0f2] pb-3">
              <div>
                <p className="m-0 text-sm font-semibold text-[#34454f]">上台成员</p>
                <p className="m-0 mt-0.5 text-xs text-[#71808a]">顺序固定，按从左到右循环播放。</p>
              </div>
              <span className="text-xs text-[#71808a]">{stageMembers.length}/{room.maxStageMembers} 人</span>
            </div>

            {stageError ? <Alert className="mb-3" type="error" showIcon message={stageError} /> : null}
            <div className="flex h-[78px] items-start gap-4 overflow-x-auto px-1">
              {stageMembers.map(member => {
                const canLeaveStage = member.id === currentUserId || isCurrentUserHost
                const isPlaying = member.id === activeMemberId

                return (
                  <div key={member.id} className="flex w-14 shrink-0 flex-col items-center text-center">
                    <span className="group relative block h-10 w-10">
                      <Avatar size={40} style={{ backgroundColor: avatarColor(member.id) }} className="!font-semibold !text-white">{member.name.slice(0, 1)}</Avatar>
                      {canLeaveStage ? (
                        <button type="button" aria-label={`让 ${member.name} 下台`} onClick={() => handleLeaveStage(member.id)} className="absolute inset-0 grid place-items-center rounded-full bg-[#222a30]/75 text-[11px] font-semibold text-white opacity-0 group-hover:opacity-100">
                          下台
                        </button>
                      ) : null}
                    </span>
                    <span className="mt-1 w-full truncate text-xs font-medium text-[#34454f]">{member.name}</span>
                    <span className={`mt-0.5 text-[10px] ${isPlaying ? 'text-[#1e88e5]' : 'text-transparent'}`}>播放中</span>
                  </div>
                )
              })}

              {!hasJoinedStage && stageMembers.length < room.maxStageMembers ? (
                <button type="button" onClick={handleJoinStage} className="flex w-14 shrink-0 flex-col items-center text-center" aria-label="上台">
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-dashed border-[#9ccff7] bg-[#f5fbff] text-lg text-[#1e88e5] hover:bg-[#eaf6ff]">+</span>
                  <span className="mt-1 text-xs font-medium text-[#1e88e5]">上台</span>
                </button>
              ) : null}
              {stageMembers.length === 0 ? <p className="m-0 py-3 text-sm text-[#71808a]">暂无成员上台。</p> : null}
            </div>
          </Card>

          <Card className="min-h-0 flex-1" styles={{ body: { height: '100%', padding: 18 } }}>
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#edf0f2] pb-3">
                <div className="min-w-0">
                  <p className="m-0 text-[10px] font-semibold tracking-[0.16em] text-[#1e88e5]">NOW PLAYING</p>
                  <p className="m-0 mt-1 truncate text-lg font-semibold text-[#222a30]">
                    {playback?.song ? playback.song.name : '等待上台成员准备歌曲'}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-[#71808a]">{playback?.song?.artists ?? '服务端自动轮播'}</span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden py-2 text-center">
                <p className="m-0 truncate text-sm text-[#71808a]">歌词将随当前歌曲在此区域滚动显示</p>
                <p className="m-0 mt-1 truncate text-base font-medium text-[#34454f]">···</p>
                <p className="m-0 mt-1 truncate text-sm text-[#71808a]">预留三行歌词显示空间</p>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </main>
  )
}
