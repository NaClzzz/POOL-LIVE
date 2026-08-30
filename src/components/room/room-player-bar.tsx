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
import { useRef, useState } from 'react'

import { RoomPlaybackProgress } from '@/components/room/room-playback-progress'
import { RoomQueueDrawer } from '@/components/room/room-queue-drawer'
import { useSession } from '@/lib/auth-client'
import { useCurrentSongLike } from '@/lib/liked-songs/use-current-song-like'
import { useRoomAudioSync } from '@/lib/room/use-room-audio-sync'
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

export function RoomPlayerBar() {
  const params = useParams<{ roomCode: string }>()
  const currentPathRoomCode = typeof params.roomCode === 'string' ? params.roomCode.toLowerCase() : null
  const { data: session } = useSession()
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

  function handleVolumeChange(value: number | number[]) {
    const nextVolume = Array.isArray(value) ? value[0] : value
    if (typeof nextVolume === 'number') setVolume(nextVolume / 100)
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

  const { audioError, audioRef, handleAudioError, needsAudioUnlock, unlockAudio } = useRoomAudioSync({
    canUseRoom,
    playbackSongId,
    playbackStatus,
    playbackVersion,
    volume,
    onMediaError: reportCurrentPlaybackError,
  })

  return (
    <>
      <audio
        ref={audioRef}
        preload="metadata"
        onError={handleAudioError}
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

        <RoomPlaybackProgress
          canUseRoom={canUseRoom}
          durationMs={playback?.durationMs ?? 0}
          startOffsetMs={playback?.startOffsetMs ?? 0}
          startedAt={playback?.startedAt ?? null}
          status={playback?.status ?? 'idle'}
        />

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
              onClick={unlockAudio}
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
