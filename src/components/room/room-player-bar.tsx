'use client'

import {
  DislikeOutlined,
  HeartFilled,
  HeartOutlined,
  SoundOutlined,
  StepForwardOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Layout, Slider, Tooltip, Typography } from 'antd'
import { useParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { RoomQueueDrawer } from '@/components/room/room-queue-drawer'
import { useSession } from '@/lib/auth-client'
import { useCurrentSongLike } from '@/lib/liked-songs/use-current-song-like'
import { getRoomPlaybackPositionMs } from '@/lib/room/playback'
import { getSocket } from '@/lib/socket-client'
import { usePlayerStore } from '@/store/player-store'
import { useRoomRealtimeStore } from '@/store/room-realtime-store'
import type { PlayerSong } from '@/types/player'
import type { RoomPlaybackState, UserRoomPlaylistItem } from '@/types/room'

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

function formatTime(time: number) {
  if (!Number.isFinite(time) || time < 0) return '00:00'

  const totalSeconds = Math.floor(time)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${String(minutes).padStart(2, '0')}:${seconds}`
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function waitForAudioReady(audio: HTMLAudioElement, signal: AbortSignal) {
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('房间歌曲加载超时。'))
    }, 10_000)

    const cleanup = () => {
      window.clearTimeout(timeout)
      audio.removeEventListener('canplay', handleLoaded)
      audio.removeEventListener('error', handleError)
      signal.removeEventListener('abort', handleAbort)
    }

    const handleLoaded = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error('房间歌曲媒体加载失败。'))
    }

    const handleAbort = () => {
      cleanup()
      reject(new DOMException('Room audio loading was cancelled.', 'AbortError'))
    }

    audio.addEventListener('canplay', handleLoaded, { once: true })
    audio.addEventListener('error', handleError, { once: true })
    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

function waitForRoomStart(delayMs: number, signal: AbortSignal) {
  if (delayMs <= 0) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      resolve()
    }, delayMs)

    const handleAbort = () => {
      cleanup()
      reject(new DOMException('Room audio start was cancelled.', 'AbortError'))
    }

    const cleanup = () => {
      window.clearTimeout(timeout)
      signal.removeEventListener('abort', handleAbort)
    }

    signal.addEventListener('abort', handleAbort, { once: true })
  })
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
  const playlist = useRoomRealtimeStore(state => state.myPlaylist)
  const playback = useRoomRealtimeStore(state => state.playback)
  const setPlaylist = useRoomRealtimeStore(state => state.setPlaylist)
  const setPlayback = useRoomRealtimeStore(state => state.setPlayback)
  const [activePanel, setActivePanel] = useState<'queue' | null>(null)
  const [playlistError, setPlaylistError] = useState<string | null>(null)
  const [isMutatingPlaylist, setIsMutatingPlaylist] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false)
  const [displayPosition, setDisplayPosition] = useState(0)
  const [playbackActionError, setPlaybackActionError] = useState<string | null>(null)
  const [isSubmittingPlaybackAction, setIsSubmittingPlaybackAction] = useState(false)
  const canUseRoom = Boolean(storedRoomCode && storedRoomCode === currentPathRoomCode)
  const playbackVersion = playback?.version ?? null
  const playbackSongId = playback?.song?.id ?? null
  const playbackStatus = playback?.status ?? 'idle'
  const currentSong = canUseRoom ? playback?.song ?? null : null
  const {
    isLiked: isCurrentSongLiked,
    isToggling: isTogglingCurrentSongLike,
    error: currentSongLikeError,
    toggleLike: handleToggleCurrentSongLike,
  } = useCurrentSongLike(currentSong)
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
    const requestId = audioRequestIdRef.current + 1
    audioRequestIdRef.current = requestId
    const abortController = new AbortController()

    if (
      !canUseRoom ||
      playbackStatus !== 'playing' ||
      playbackVersion === null ||
      playbackSongId === null
    ) {
      audio?.pause()
      return () => abortController.abort()
    }

    async function loadAndStartRoomAudio() {
      try {
        const response = await fetch(`/api/music/play-url/${playbackSongId}`, {
          signal: abortController.signal,
        })
        const data = (await response.json()) as PlayUrlResponse
        if (!response.ok) throw new Error(data.message || '获取房间播放地址失败。')

        const url = data.data?.[0]?.url
        if (!url) throw new Error('这首歌暂时无法播放，可能受版权或会员限制。')
        if (abortController.signal.aborted || audioRequestIdRef.current !== requestId) return

        const currentAudio = audioRef.current
        if (!currentAudio) return

        setAudioError(null)
        setNeedsAudioUnlock(false)
        currentAudio.pause()
        currentAudio.src = url
        currentAudio.load()
        await waitForAudioReady(currentAudio, abortController.signal)
        if (abortController.signal.aborted || audioRequestIdRef.current !== requestId) return

        const latestPlayback = useRoomRealtimeStore.getState().playback
        if (
          !latestPlayback ||
          latestPlayback.status !== 'playing' ||
          latestPlayback.version !== playbackVersion ||
          latestPlayback.song?.id !== playbackSongId
        ) {
          return
        }

        const startAt = latestPlayback.startedAt ? new Date(latestPlayback.startedAt).getTime() : Number.NaN
        if (Number.isFinite(startAt)) {
          await waitForRoomStart(Math.max(0, startAt - Date.now()), abortController.signal)
        }
        if (abortController.signal.aborted || audioRequestIdRef.current !== requestId) return

        const currentPlayback = useRoomRealtimeStore.getState().playback
        if (
          !currentPlayback ||
          currentPlayback.status !== 'playing' ||
          currentPlayback.version !== playbackVersion ||
          currentPlayback.song?.id !== playbackSongId
        ) {
          return
        }

        const targetPosition = getRoomPlaybackPositionMs(currentPlayback) / 1000
        const mediaDuration = currentAudio.duration
        currentAudio.currentTime = Number.isFinite(mediaDuration) && mediaDuration > 0
          ? Math.min(targetPosition, mediaDuration)
          : targetPosition

        await currentAudio.play()
        if (abortController.signal.aborted || audioRequestIdRef.current !== requestId) return
        setNeedsAudioUnlock(false)
        setAudioError(null)
      } catch (loadFailure) {
        if (abortController.signal.aborted || audioRequestIdRef.current !== requestId || isAbortError(loadFailure)) return
        setAudioError(loadFailure instanceof Error ? loadFailure.message : '房间歌曲播放失败。')
        if (loadFailure instanceof DOMException && loadFailure.name === 'NotAllowedError') {
          setNeedsAudioUnlock(true)
        }
      }
    }

    void loadAndStartRoomAudio()
    return () => {
      abortController.abort()
    }
  }, [canUseRoom, playbackSongId, playbackStatus, playbackVersion])

  useEffect(() => {
    const audio = audioRef.current
    return () => audio?.pause()
  }, [])

  function handleVolumeChange(value: number | number[]) {
    const nextVolume = Array.isArray(value) ? value[0] : value
    if (typeof nextVolume === 'number') setVolume(nextVolume / 100)
  }

  function handleUnlockAudio() {
    const audio = audioRef.current
    if (!audio) return

    void audio.play().then(
      () => {
        setNeedsAudioUnlock(false)
        setAudioError(null)
      },
      () => setNeedsAudioUnlock(true),
    )
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
      <Layout.Footer className="!fixed !bottom-0 !left-0 !right-0 !z-30 !flex !min-h-24 !items-center !gap-4 !border-t !border-[#dfe4e7] !bg-white !px-12 !py-3">
        <div className="flex min-w-0 items-center gap-3 lg:max-w-xs">
          <Avatar shape="square" size={56} src={currentSong?.coverUrl} className="!shrink-0 !bg-[#42a5f5]">
            {currentSong?.name.slice(0, 1) ?? '♪'}
          </Avatar>
          <div className="min-w-0 flex-1">
            <Typography.Text className="!block !truncate !font-medium">
              {currentSong?.name ?? '等待上台成员准备歌曲'}
            </Typography.Text>
            <Typography.Text type={audioError || currentSongLikeError ? 'danger' : 'secondary'} className="!block !truncate !text-xs">
              {audioError ?? currentSongLikeError ?? currentSong?.artists ?? '上台后会按顺序自动轮播'}
            </Typography.Text>
          </div>
          <Tooltip title={isCurrentSongLiked ? '取消喜欢' : '喜欢这首歌'}>
            <Button
              className="shrink-0"
              type="text"
              shape="circle"
              loading={isTogglingCurrentSongLike}
              disabled={!currentSong || isTogglingCurrentSongLike}
              onClick={() => void handleToggleCurrentSongLike()}
              aria-label={isCurrentSongLiked ? '取消喜欢当前歌曲' : '喜欢当前歌曲'}
              icon={
                isCurrentSongLiked ? <HeartFilled className="!text-[#42a5f5]" /> : <HeartOutlined />
              }
            />
          </Tooltip>
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
              onClick={handleUnlockAudio}
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
