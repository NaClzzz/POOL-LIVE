'use client'

import {
  CaretRightFilled,
  CustomerServiceOutlined,
  HeartFilled,
  HeartOutlined,
  OrderedListOutlined,
  PauseOutlined,
  RetweetOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Layout, Slider, Tooltip, Typography } from 'antd'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { PlayerProgress } from '@/components/player/player-progress'
import { QueueDrawer } from '@/components/player/queue-drawer'
import { RoomPlayerBar } from '@/components/room/room-player-bar'
import { useCurrentSongLike } from '@/lib/liked-songs/use-current-song-like'
import { usePersonalAudio } from '@/lib/player/use-personal-audio'
import { usePlayerStore } from '@/store/player-store'

// 用于读取喜欢歌曲列表的接口响应。
type LikesResponse = {
  songs?: Array<{
    song_id: number
    name: string
    artists: string
    album_name: string
    cover_url: string | null
    duration_ms: number
  }>
  message?: string
}

export function PlayerBar() {
  const pathname = usePathname()

  if (pathname.startsWith('/rooms/')) return <RoomPlayerBar />

  return <PersonalPlayerBar />
}

function PersonalPlayerBar() {
  const [isQueueHydrating, setIsQueueHydrating] = useState(true)
  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const [isQueuePreparing, setIsQueuePreparing] = useState(false)
  const [isSwitchingPlaybackMode, setIsSwitchingPlaybackMode] = useState(false)
  const currentSong = usePlayerStore(state => state.currentSong)
  const {
    isLiked: isCurrentSongLiked,
    isToggling: isTogglingCurrentSongLike,
    error: currentSongLikeError,
    toggleLike: handleToggleCurrentSongLike,
  } = useCurrentSongLike(currentSong)
  const queue = usePlayerStore(state => state.queue)
  const currentIndex = usePlayerStore(state => state.currentIndex)
  const queueSource = usePlayerStore(state => state.queueSource)
  const playbackMode = usePlayerStore(state => state.playbackMode)
  const volume = usePlayerStore(state => state.volume)
  const playbackError = usePlayerStore(state => state.playbackError)
  const selectQueueSong = usePlayerStore(state => state.selectQueueSong)
  const nextSong = usePlayerStore(state => state.nextSong)
  const playPreviousSong = usePlayerStore(state => state.previousSong)
  const removeFromQueue = usePlayerStore(state => state.removeFromQueue)
  const moveQueueSong = usePlayerStore(state => state.moveQueueSong)
  const setLocalPlaybackMode = usePlayerStore(state => state.setLocalPlaybackMode)
  const applyLikedQueueForPlaybackMode = usePlayerStore(
    state => state.applyLikedQueueForPlaybackMode,
  )
  const restoreQueue = usePlayerStore(state => state.restoreQueue)
  const setIsPlaying = usePlayerStore(state => state.setIsPlaying)
  const setVolume = usePlayerStore(state => state.setVolume)
  const setPlaybackError = usePlayerStore(state => state.setPlaybackError)
  const {
    audioRef,
    audioUrl,
    handleAudioEnded,
    handleAudioError,
    handleLoadedMetadata,
    isLoadingAudio,
    isPlaying,
    loadAudioForSong,
    seek,
    togglePlayback,
  } = usePersonalAudio()

  useEffect(() => {
    let isCurrent = true

    void Promise.resolve(usePlayerStore.persist.rehydrate())
      .then(() => {
        if (!isCurrent) return

        restoreQueue()
        setIsQueueHydrating(false)
      })
      .catch(() => {
        if (isCurrent) setIsQueueHydrating(false)
      })

    return () => {
      isCurrent = false
    }
  }, [restoreQueue])

  function handleTogglePlayback() {
    togglePlayback(currentSong)
  }

  function handlePreviousSong() {
    const previousQueueSong = playPreviousSong()

    if (previousQueueSong) void loadAudioForSong(previousQueueSong, true)
  }

  function handleNextSong() {
    const nextQueueSong = nextSong()

    if (nextQueueSong) void loadAudioForSong(nextQueueSong, true)
  }

  function handleSelectQueueSong(index: number) {
    if (index === currentIndex && audioUrl) {
      setPlaybackError(null)
      setIsPlaying(true)
      return
    }

    const selectedSong = selectQueueSong(index)

    if (selectedSong) void loadAudioForSong(selectedSong, true)
  }

  function handleVolumeChange(value: number | number[]) {
    const nextVolume = Array.isArray(value) ? value[0] : value

    if (typeof nextVolume === 'number') setVolume(nextVolume / 100)
  }

  function handleQueuePanelOpen() {
    setIsQueueOpen(true)
    setIsQueuePreparing(true)

    requestAnimationFrame(() => {
      setIsQueuePreparing(false)
    })
  }

  function handleQueuePanelClose() {
    setIsQueueOpen(false)
    setIsQueuePreparing(false)
  }

  async function handlePlaybackModeSwitch() {
    if (isSwitchingPlaybackMode || queue.length === 0) return

    const nextMode = playbackMode === 'sequential' ? 'shuffle' : 'sequential'
    setPlaybackError(null)

    if (queueSource !== 'liked') {
      setLocalPlaybackMode(nextMode)
      return
    }

    setIsSwitchingPlaybackMode(true)

    try {
      const response = await fetch('/api/likes')
      const data = (await response.json()) as LikesResponse

      if (!response.ok) {
        throw new Error(data.message || '读取最新喜欢列表失败，请稍后再试')
      }

      const latestLikedQueue = (data.songs ?? []).map(song => ({
        id: song.song_id,
        name: song.name,
        artists: song.artists,
        albumName: song.album_name,
        coverUrl: song.cover_url ?? undefined,
        duration: song.duration_ms,
      }))

      applyLikedQueueForPlaybackMode(latestLikedQueue, nextMode)
    } catch (error) {
      setPlaybackError(
        error instanceof Error ? error.message : '切换播放模式失败，请稍后再试',
      )
    } finally {
      setIsSwitchingPlaybackMode(false)
    }
  }

  function handleMoveQueueSong(fromIndex: number, toIndex: number) {
    const movedCurrentSong = moveQueueSong(fromIndex, toIndex)

    // Reordering the active song restarts it from 0, but must not turn a
    // paused player into a playing one.
    if (movedCurrentSong) void loadAudioForSong(movedCurrentSong, isPlaying)
  }

  const canPlayPrevious = currentIndex >= 0 && queue.length > 0
  const canPlayNext = queue.length > 0
  const isQueueLoading = isQueueHydrating || isQueuePreparing
  return (
    <>
      <QueueDrawer
        open={isQueueOpen}
        isLoading={isQueueLoading}
        queue={queue}
        currentIndex={currentIndex}
        isLoadingAudio={isLoadingAudio}
        onClose={handleQueuePanelClose}
        onSelect={handleSelectQueueSong}
        onRemove={removeFromQueue}
        onMove={handleMoveQueueSong}
      />
      <Layout.Footer className="!fixed !bottom-0 !left-0 !right-0 !z-30 !flex !min-h-24 !items-center !gap-4 !border-t !border-[#dfe4e7] !bg-white !px-12 !py-3">
      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={event => usePlayerStore.getState().setCurrentTime(event.currentTarget.currentTime)}
        onEnded={handleAudioEnded}
        onError={handleAudioError}
      />

      <div className="flex min-w-0 items-center gap-3 lg:max-w-xs">
        <Avatar
          shape="square"
          size={56}
          src={currentSong?.coverUrl}
          className="!shrink-0 !bg-[#eef1f3] !text-[#71808a]"
        >
          {currentSong?.name.slice(0, 1) ?? '♪'}
        </Avatar>
        <div className="min-w-0 flex-1">
          <Typography.Text className="!block !truncate !font-medium">
            {currentSong?.name ?? '暂未播放'}
          </Typography.Text>
          <Typography.Text
            type={playbackError || currentSongLikeError ? 'danger' : 'secondary'}
            className="!block !truncate !text-xs"
          >
            {playbackError ?? currentSongLikeError ?? (currentSong ? currentSong.artists : '选择一首歌开始聆听')}
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

      <div className="absolute left-1/2 top-1/2 hidden w-[min(560px,46vw)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 md:flex">
        <div className="flex items-center gap-1">
          <Tooltip title={playbackMode === 'sequential' ? '当前：顺序播放（点击切换为随机排序）' : '当前：随机排序（点击切换为顺序播放）'}>
            <Button
              type="text"
              shape="circle"
              loading={isSwitchingPlaybackMode}
              disabled={queue.length === 0 || isLoadingAudio}
              onClick={() => void handlePlaybackModeSwitch()}
              aria-label={playbackMode === 'sequential' ? '当前为顺序播放，切换为随机排序' : '当前为随机排序，切换为顺序播放'}
              className={
                playbackMode === 'shuffle'
                  ? '!bg-[#eaf6ff] !text-[#1e88e5]'
                  : '!text-[#52616a]'
              }
              icon={playbackMode === 'shuffle' ? <RetweetOutlined /> : <OrderedListOutlined />}
            />
          </Tooltip>
          <Tooltip title="上一首">
            <Button
              type="text"
              shape="circle"
              disabled={!canPlayPrevious || isLoadingAudio}
              onClick={handlePreviousSong}
              icon={<StepBackwardOutlined />}
            />
          </Tooltip>
          <Button
            type="primary"
            shape="circle"
            size="large"
            className="!grid !h-12 !w-12 !min-w-12 !place-items-center !rounded-full !p-0"
            loading={isLoadingAudio}
            disabled={!currentSong}
            onClick={handleTogglePlayback}
            icon={isPlaying ? <PauseOutlined /> : <CaretRightFilled />}
          />
          <Tooltip title="下一首">
            <Button
              type="text"
              shape="circle"
              disabled={!canPlayNext || isLoadingAudio}
              onClick={handleNextSong}
              icon={<StepForwardOutlined />}
            />
          </Tooltip>
        </div>
        <PlayerProgress currentSong={currentSong} onSeek={seek} />
      </div>

      <div className="ml-auto hidden items-center gap-1 sm:flex">
        <Button type="text" shape="circle" disabled icon={<CustomerServiceOutlined />} />
        <Slider
          className="!mb-0 !w-20"
          min={0}
          max={100}
          value={volume * 100}
          tooltip={{ open: false }}
          onChange={handleVolumeChange}
        />
        <button
          type="button"
          disabled={!isQueueHydrating && queue.length === 0}
          aria-label={isQueueLoading ? '正在加载播放列表' : `打开播放列表，共 ${queue.length} 首歌`}
          onClick={handleQueuePanelOpen}
          className="grid h-8 w-8 place-items-center rounded-full text-lg text-[#52616a] hover:bg-[#eaf6ff] hover:text-[#1e88e5] disabled:cursor-not-allowed disabled:opacity-40"
        >
          ≡
        </button>
      </div>
      </Layout.Footer>
    </>
  )
}
