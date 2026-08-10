'use client'

import {
  DislikeOutlined,
  MessageOutlined,
  SoundOutlined,
  StepForwardOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { Avatar, Layout, Slider, Tooltip, Typography } from 'antd'
import { useParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { RoomChatDrawer } from '@/components/room/room-chat-drawer'
import { RoomQueueDrawer } from '@/components/room/room-queue-drawer'
import { useSession } from '@/lib/auth-client'
import { getRoomPlaybackPositionMs } from '@/lib/room/playback'
import { getSocket } from '@/lib/socket-client'
import { usePlayerStore } from '@/store/player-store'
import { useRoomRealtimeStore } from '@/store/room-realtime-store'
import type { PlayerSong } from '@/types/player'
import type { RoomPlaybackState, UserRoomPlaylistItem } from '@/types/room'

// 用于 chat:send 确认回调，通知聊天抽屉是否应清空输入内容。
type ChatMessageAcknowledgement =
  | { ok: true }
  | {
      ok: false
      message: string
    }

// 用于房间全局上台歌单修改事件的确认回调。
type PlaylistAcknowledgement =
  | { ok: true; playlist: UserRoomPlaylistItem[] }
  | {
      ok: false
      message: string
    }

// 用于当前播放者切歌与房间成员投票切歌的 Socket 确认回调。
type PlaybackActionAcknowledgement =
  | { ok: true; playback: RoomPlaybackState }
  | {
      ok: false
      message: string
    }

// 用于播放地址接口的响应数据。
type PlayUrlResponse = {
  data?: Array<{ url: string | null }>
  message?: string
}

// 用于房间音频加载后标识当前可播放节目版本。
type RoomAudioSource = {
  version: number
  url: string
}

function formatTime(time: number) {
  if (!Number.isFinite(time) || time < 0) return '00:00'

  const totalSeconds = Math.floor(time)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${String(minutes).padStart(2, '0')}:${seconds}`
}

export function RoomPlayerBar() {
  const params = useParams<{ roomCode: string }>()
  const currentPathRoomCode = typeof params.roomCode === 'string' ? params.roomCode.toLowerCase() : null
  const { data: session } = useSession()
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioRequestIdRef = useRef(0)
  const reportedPlaybackVersionRef = useRef<number | null>(null)
  const volume = usePlayerStore(state => state.volume)
  const setVolume = usePlayerStore(state => state.setVolume)
  const storedRoomCode = useRoomRealtimeStore(state => state.roomCode)
  const messages = useRoomRealtimeStore(state => state.messages)
  const playlist = useRoomRealtimeStore(state => state.myPlaylist)
  const playback = useRoomRealtimeStore(state => state.playback)
  const setPlaylist = useRoomRealtimeStore(state => state.setPlaylist)
  const setPlayback = useRoomRealtimeStore(state => state.setPlayback)
  const [activePanel, setActivePanel] = useState<'chat' | 'queue' | null>(null)
  const [chatError, setChatError] = useState<string | null>(null)
  const [playlistError, setPlaylistError] = useState<string | null>(null)
  const [isMutatingPlaylist, setIsMutatingPlaylist] = useState(false)
  const [audioSource, setAudioSource] = useState<RoomAudioSource | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false)
  const [unlockAttempt, setUnlockAttempt] = useState(0)
  const [displayPosition, setDisplayPosition] = useState(0)
  const [playbackActionError, setPlaybackActionError] = useState<string | null>(null)
  const [isSubmittingPlaybackAction, setIsSubmittingPlaybackAction] = useState(false)
  const canUseRoom = Boolean(storedRoomCode && storedRoomCode === currentPathRoomCode)
  const currentSong = canUseRoom ? playback?.song ?? null : null
  const isCurrentPlayer = Boolean(
    session?.user.id && playback?.status === 'playing' && playback.activeMemberId === session.user.id,
  )
  const hasVotedToSkip = Boolean(session?.user.id && playback?.skipVoterIds.includes(session.user.id))
  const canVoteToSkip = Boolean(
    canUseRoom &&
      playback?.status === 'playing' &&
      playback.activeMemberId &&
      !isCurrentPlayer &&
      playback.skipVoteRequired > 0 &&
      !hasVotedToSkip,
  )

  useEffect(() => {
    if (!canUseRoom) return

    const initialFrame = requestAnimationFrame(() => setDisplayPosition(getRoomPlaybackPositionMs(playback) / 1000))
    const timer = window.setInterval(() => setDisplayPosition(getRoomPlaybackPositionMs(playback) / 1000), 250)
    return () => {
      cancelAnimationFrame(initialFrame)
      window.clearInterval(timer)
    }
  }, [canUseRoom, playback])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    const currentPlayback = playback
    const requestId = audioRequestIdRef.current + 1
    audioRequestIdRef.current = requestId

    if (!canUseRoom || !currentPlayback || currentPlayback.status !== 'playing' || !currentPlayback.song) {
      audio?.pause()
      const resetFrame = requestAnimationFrame(() => {
        setAudioSource(null)
        setNeedsAudioUnlock(false)
      })
      return () => cancelAnimationFrame(resetFrame)
    }

    const playablePlayback = currentPlayback
    const playableSong = currentPlayback.song

    let isCurrent = true
    const resetFrame = requestAnimationFrame(() => {
      setAudioError(null)
      setNeedsAudioUnlock(false)
    })

    async function loadRoomAudio() {
      try {
        const response = await fetch(`/api/music/play-url/${playableSong.id}`)
        const data = (await response.json()) as PlayUrlResponse
        if (!response.ok) throw new Error(data.message || '获取房间播放地址失败。')

        const url = data.data?.[0]?.url
        if (!url) throw new Error('这首歌暂时无法播放，可能受版权或会员限制。')
        if (!isCurrent || audioRequestIdRef.current !== requestId) return

        const currentAudio = audioRef.current
        if (currentAudio) {
          currentAudio.pause()
          currentAudio.src = url
          currentAudio.load()
        }
        setAudioSource({ version: playablePlayback.version, url })
      } catch (loadFailure) {
        if (!isCurrent || audioRequestIdRef.current !== requestId) return
        setAudioError(loadFailure instanceof Error ? loadFailure.message : '房间歌曲播放失败。')
      }
    }

    void loadRoomAudio()
    return () => {
      isCurrent = false
      cancelAnimationFrame(resetFrame)
    }
  }, [canUseRoom, playback, playback?.song?.id, playback?.status, playback?.version])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioSource || !playback || playback.status !== 'playing') return
    if (audioSource.version !== playback.version) return

    const targetPosition = getRoomPlaybackPositionMs(playback) / 1000
    if (Math.abs(audio.currentTime - targetPosition) > 1) audio.currentTime = targetPosition

    void audio.play().then(
      () => {
        setNeedsAudioUnlock(false)
        setAudioError(null)
      },
      () => setNeedsAudioUnlock(true),
    )
  }, [audioSource, playback, unlockAttempt])

  useEffect(() => {
    const audio = audioRef.current
    return () => audio?.pause()
  }, [])

  function handleVolumeChange(value: number | number[]) {
    const nextVolume = Array.isArray(value) ? value[0] : value
    if (typeof nextVolume === 'number') setVolume(nextVolume / 100)
  }

  async function handleSendChatMessage(content: string) {
    if (!storedRoomCode || !canUseRoom) {
      setChatError('正在加入房间，暂时不能发送消息。')
      return false
    }

    const socket = getSocket()
    if (!socket.connected) {
      setChatError('实时服务未连接，暂时不能发送消息。')
      return false
    }

    return new Promise<boolean>(resolve => {
      socket.emit('chat:send', { content }, (result: ChatMessageAcknowledgement) => {
        if (result.ok) {
          setChatError(null)
          resolve(true)
          return
        }

        setChatError(result.message)
        resolve(false)
      })
    })
  }

  function handlePlaylistMutation(
    eventName: 'room:playlist:add' | 'room:playlist:remove' | 'room:playlist:reorder',
    payload: Record<string, unknown>,
  ) {
    const socket = getSocket()
    if (!canUseRoom || !socket.connected || isMutatingPlaylist) {
      setPlaylistError('实时服务未连接，暂时不能修改上台歌单。')
      return
    }

    setIsMutatingPlaylist(true)
    setPlaylistError(null)
    socket.emit(eventName, payload, (result: PlaylistAcknowledgement) => {
      setIsMutatingPlaylist(false)
      if (result.ok) {
        setPlaylist(result.playlist)
        return
      }

      setPlaylistError(result.message)
    })
  }

  function handlePlaylistAction(
    eventName: 'room:playlist:shuffle' | 'room:playlist:import-liked' | 'room:playlist:clear',
  ) {
    const socket = getSocket()
    if (!canUseRoom || !socket.connected || isMutatingPlaylist) {
      setPlaylistError('实时服务未连接，暂时不能修改上台歌单。')
      return
    }

    setIsMutatingPlaylist(true)
    setPlaylistError(null)
    socket.emit(eventName, (result: PlaylistAcknowledgement) => {
      setIsMutatingPlaylist(false)
      if (result.ok) {
        setPlaylist(result.playlist)
        return
      }

      setPlaylistError(result.message)
    })
  }

  function reportCurrentPlaybackError() {
    if (!canUseRoom || !playback || !session?.user.id) return
    if (playback.activeMemberId !== session.user.id || !playback.currentItemId) return
    if (reportedPlaybackVersionRef.current === playback.version) return

    reportedPlaybackVersionRef.current = playback.version
    getSocket().emit('room:playback:media-error', {
      version: playback.version,
      itemId: playback.currentItemId,
    })
  }

  function handlePlaybackAction(eventName: 'room:playback:skip' | 'room:playback:vote-skip') {
    const socket = getSocket()
    if (!canUseRoom || !storedRoomCode || !socket.connected || isSubmittingPlaybackAction) {
      setPlaybackActionError('实时服务未连接，暂时不能操作切歌。')
      return
    }

    setIsSubmittingPlaybackAction(true)
    setPlaybackActionError(null)
    socket.emit(eventName, (result: PlaybackActionAcknowledgement) => {
      setIsSubmittingPlaybackAction(false)
      if (result.ok) {
        setPlayback(storedRoomCode, result.playback)
        return
      }

      setPlaybackActionError(result.message)
    })
  }

  const duration = playback?.durationMs ? playback.durationMs / 1000 : 0

  return (
    <>
      <audio
        ref={audioRef}
        preload="metadata"
        onError={() => {
          setAudioError('歌曲播放失败，正在尝试跳过。')
          reportCurrentPlaybackError()
        }}
      />
      <RoomQueueDrawer
        open={activePanel === 'queue'}
        playlist={playlist}
        isMutating={isMutatingPlaylist}
        error={playlistError}
        onClose={() => setActivePanel(null)}
        onAddSong={(song: PlayerSong) => handlePlaylistMutation('room:playlist:add', { song })}
        onRemoveSong={itemId => handlePlaylistMutation('room:playlist:remove', { itemId })}
        onMoveSong={(itemId, toIndex) =>
          handlePlaylistMutation('room:playlist:reorder', { itemId, toIndex })
        }
        onShuffle={() => handlePlaylistAction('room:playlist:shuffle')}
        onImportLiked={() => handlePlaylistAction('room:playlist:import-liked')}
        onClear={() => handlePlaylistAction('room:playlist:clear')}
      />
      <RoomChatDrawer
        open={activePanel === 'chat'}
        messages={canUseRoom ? messages : []}
        currentUserId={session?.user.id}
        error={chatError}
        onClose={() => setActivePanel(null)}
        onSend={handleSendChatMessage}
      />
      <Layout.Footer className="!fixed !bottom-0 !left-0 !right-0 !z-30 !flex !min-h-24 !items-center !gap-4 !border-t !border-[#dfe4e7] !bg-white !px-12 !py-3">
        <div className="flex min-w-0 items-center gap-3 lg:max-w-xs">
          <Avatar shape="square" size={56} src={currentSong?.coverUrl} className="!shrink-0 !bg-[#42a5f5]">
            {currentSong?.name.slice(0, 1) ?? '♪'}
          </Avatar>
          <div className="min-w-0 flex-1">
            <Typography.Text className="!block !truncate !font-medium">
              {currentSong?.name ?? '等待上台成员准备歌曲'}
            </Typography.Text>
            <Typography.Text type={audioError ? 'danger' : 'secondary'} className="!block !truncate !text-xs">
              {audioError ?? currentSong?.artists ?? '上台后会按顺序自动轮播'}
            </Typography.Text>
          </div>
        </div>

        <div className="absolute left-1/2 top-1/2 hidden w-[min(560px,46vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-1 md:flex">
          <div className="flex w-full items-center gap-3">
            <Typography.Text type="secondary" className="!text-xs">
              {formatTime(displayPosition)}
            </Typography.Text>
            <Slider
              className="!mb-0 flex-1"
              disabled
              min={0}
              max={duration || 1}
              value={Math.min(displayPosition, duration || 0)}
              tooltip={{ open: false }}
            />
            <Typography.Text type="secondary" className="!text-xs">
              {formatTime(duration)}
            </Typography.Text>
          </div>
          <Typography.Text type="secondary" className="!text-center !text-[11px]">
            {playback?.status === 'playing' ? '房间正在按固定上台顺序自动轮播' : '等待上台成员准备歌曲'}
          </Typography.Text>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Tooltip
            title={
              isCurrentPlayer
                ? '结束自己的节目，并轮到上台序列中的下一位成员'
                : '只有当前播放者可以直接切歌'
            }
          >
            <button
              type="button"
              disabled={!isCurrentPlayer || isSubmittingPlaybackAction}
              aria-label="切歌"
              onClick={() => handlePlaybackAction('room:playback:skip')}
              className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-medium text-[#52616a] hover:bg-[#eaf6ff] hover:text-[#1e88e5] disabled:cursor-not-allowed disabled:text-[#c3cbd0]"
            >
              <StepForwardOutlined />
              切歌
            </button>
          </Tooltip>
          <Tooltip
            title={
              isCurrentPlayer
                ? '当前播放者可直接切歌，无需投票'
                : hasVotedToSkip
                  ? '已投票，等待其他在线成员'
                  : playback?.skipVoteRequired
                    ? '其他所有在线成员投票后将自动切歌'
                    : '当前没有其他成员可以参与投票'
            }
          >
            <button
              type="button"
              disabled={!canVoteToSkip || isSubmittingPlaybackAction}
              aria-label="投票切歌"
              onClick={() => handlePlaybackAction('room:playback:vote-skip')}
              className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-medium text-[#52616a] hover:bg-[#eaf6ff] hover:text-[#1e88e5] disabled:cursor-not-allowed disabled:text-[#c3cbd0]"
            >
              <DislikeOutlined />
              投票 {playback?.skipVoteCount ?? 0}/{playback?.skipVoteRequired ?? 0}
            </button>
          </Tooltip>
          <SoundOutlined className="text-[#52616a]" />
          <Slider
            className="!mb-0 !w-20"
            min={0}
            max={100}
            value={volume * 100}
            tooltip={{ open: false }}
            onChange={handleVolumeChange}
          />
          {needsAudioUnlock ? (
            <button
              type="button"
              onClick={() => setUnlockAttempt(value => value + 1)}
              className="rounded-full bg-[#eaf6ff] px-3 py-1 text-xs font-medium text-[#1e88e5]"
            >
              点击开启声音
            </button>
          ) : null}
          <Tooltip title={canUseRoom ? '打开全局上台歌单' : '正在连接房间'}>
            <button
              type="button"
              disabled={!canUseRoom}
              aria-label="打开全局上台歌单"
              onClick={() => {
                setPlaylistError(null)
                setActivePanel('queue')
              }}
              className="grid h-8 w-8 place-items-center rounded-full text-lg text-[#52616a] hover:bg-[#eaf6ff] hover:text-[#1e88e5] disabled:cursor-not-allowed disabled:text-[#c3cbd0]"
            >
              <UnorderedListOutlined />
            </button>
          </Tooltip>
          <Tooltip title={canUseRoom ? '打开房间聊天' : '正在连接房间聊天'}>
            <button
              type="button"
              disabled={!canUseRoom}
              aria-label="打开房间聊天"
              onClick={() => {
                setChatError(null)
                setActivePanel('chat')
              }}
              className="grid h-8 w-8 place-items-center rounded-full text-lg text-[#52616a] hover:bg-[#eaf6ff] hover:text-[#1e88e5] disabled:cursor-not-allowed disabled:text-[#c3cbd0]"
            >
              <MessageOutlined />
            </button>
          </Tooltip>
        </div>
        {playbackActionError ? (
          <Typography.Text className="absolute bottom-1 right-12 !text-[11px] !text-[#d4380d]">
            {playbackActionError}
          </Typography.Text>
        ) : null}
      </Layout.Footer>
    </>
  )
}
