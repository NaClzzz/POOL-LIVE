'use client'

import {
  CaretRightFilled,
  CustomerServiceOutlined,
  HeartOutlined,
  PauseOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Layout, Slider, Tooltip, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'

import { QueueDrawer } from '@/components/player/queue-drawer'
import { usePlayerStore } from '@/store/player-store'
import type { PlayerSong } from '@/types/player'

type PlayUrlResponse = {
  data?: Array<{
    url: string | null
  }>
  message?: string
}

function formatTime(time: number) {
  if (!Number.isFinite(time) || time < 0) return '00:00'

  const totalSeconds = Math.floor(time)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${String(minutes).padStart(2, '0')}:${seconds}`
}

export function PlayerBar() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioRequestIdRef = useRef(0)
  const [isQueueHydrating, setIsQueueHydrating] = useState(true)
  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const [isQueuePreparing, setIsQueuePreparing] = useState(false)
  const currentSong = usePlayerStore(state => state.currentSong)
  const queue = usePlayerStore(state => state.queue)
  const currentIndex = usePlayerStore(state => state.currentIndex)
  const audioUrl = usePlayerStore(state => state.audioUrl)
  const isPlaying = usePlayerStore(state => state.isPlaying)
  const isLoadingAudio = usePlayerStore(state => state.isLoadingAudio)
  const currentTime = usePlayerStore(state => state.currentTime)
  const duration = usePlayerStore(state => state.duration)
  const volume = usePlayerStore(state => state.volume)
  const playbackError = usePlayerStore(state => state.playbackError)
  const selectQueueSong = usePlayerStore(state => state.selectQueueSong)
  const nextSong = usePlayerStore(state => state.nextSong)
  const playPreviousSong = usePlayerStore(state => state.previousSong)
  const removeFromQueue = usePlayerStore(state => state.removeFromQueue)
  const restoreQueue = usePlayerStore(state => state.restoreQueue)
  const setAudioSource = usePlayerStore(state => state.setAudioSource)
  const setIsLoadingAudio = usePlayerStore(state => state.setIsLoadingAudio)
  const setIsPlaying = usePlayerStore(state => state.setIsPlaying)
  const setCurrentTime = usePlayerStore(state => state.setCurrentTime)
  const setDuration = usePlayerStore(state => state.setDuration)
  const setVolume = usePlayerStore(state => state.setVolume)
  const setPlaybackError = usePlayerStore(state => state.setPlaybackError)

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

  useEffect(() => {
    const audio = audioRef.current

    if (!audio) return

    if (!audioUrl) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      return
    }

    audio.pause()
    audio.src = audioUrl
    audio.load()
  }, [audioUrl])

  useEffect(() => {
    const audio = audioRef.current

    if (!audioUrl || !audio) return

    if (!isPlaying) {
      audio.pause()
      return
    }

    void audio.play().catch(() => {
      setIsPlaying(false)
      setPlaybackError('浏览器阻止了自动播放，请再点击一次播放按钮。')
    })
  }, [audioUrl, isPlaying, setIsPlaying, setPlaybackError])

  useEffect(() => {
    const audio = audioRef.current

    if (audio) audio.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current

    return () => {
      audio?.pause()
    }
  }, [])

  async function loadAudioForSong(song: PlayerSong, shouldPlay: boolean) {
    const requestId = audioRequestIdRef.current + 1
    audioRequestIdRef.current = requestId
    setIsLoadingAudio(true)
    setPlaybackError(null)
    setIsPlaying(false)

    try {
      const response = await fetch(`/api/music/play-url/${song.id}`)
      const data = (await response.json()) as PlayUrlResponse
      const nextAudioUrl = data.data?.[0]?.url

      if (!response.ok) {
        throw new Error(data.message || '获取播放地址失败，请稍后再试')
      }

      if (!nextAudioUrl) {
        throw new Error('这首歌暂时无法播放，可能受版权或会员限制。')
      }

      if (audioRequestIdRef.current !== requestId) return

      setAudioSource(nextAudioUrl, shouldPlay)
    } catch (error) {
      if (audioRequestIdRef.current !== requestId) return

      setPlaybackError(error instanceof Error ? error.message : '歌曲播放失败，请稍后再试')
    } finally {
      if (audioRequestIdRef.current === requestId) setIsLoadingAudio(false)
    }
  }

  function handleTogglePlayback() {
    if (!currentSong) return

    if (isPlaying) {
      setIsPlaying(false)
      return
    }

    if (audioUrl) {
      setPlaybackError(null)
      setIsPlaying(true)
      return
    }

    void loadAudioForSong(currentSong, true)
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

  function handleSeek(value: number | number[]) {
    const nextTime = Array.isArray(value) ? value[0] : value
    const audio = audioRef.current

    if (!audio || typeof nextTime !== 'number') return

    audio.currentTime = nextTime
    setCurrentTime(nextTime)
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

  const totalDuration = duration || (currentSong ? currentSong.duration / 1000 : 0)
  const canPlayPrevious = currentIndex > 0
  const canPlayNext = currentIndex >= 0 && currentIndex < queue.length - 1
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
      />
      <Layout.Footer className="!fixed !bottom-0 !left-0 !right-0 !z-30 !flex !min-h-24 !items-center !gap-4 !border-t !border-[#dfe4e7] !bg-white !px-12 !py-3">
      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
        onEnded={event => {
          const nextQueueSong = nextSong()

          if (nextQueueSong) {
            void loadAudioForSong(nextQueueSong, true)
            return
          }

          event.currentTarget.currentTime = 0
          setCurrentTime(0)
          setIsPlaying(false)
        }}
        onError={() => {
          setIsPlaying(false)
          setPlaybackError('歌曲播放失败，可能是音源失效或受版权限制。')
        }}
      />

      <div className="flex min-w-0 items-center gap-3 lg:max-w-xs">
        <Avatar
          shape="square"
          size={56}
          src={currentSong?.coverUrl}
          className="!shrink-0 !bg-[#42a5f5]"
        >
          {currentSong?.name.slice(0, 1) ?? '♪'}
        </Avatar>
        <div className="min-w-0 flex-1">
          <Typography.Text className="!block !truncate !font-medium">
            {currentSong?.name ?? '暂未播放'}
          </Typography.Text>
          <Typography.Text
            type={playbackError ? 'danger' : 'secondary'}
            className="!block !truncate !text-xs"
          >
            {playbackError ?? (currentSong ? currentSong.artists : '选择一首歌开始聆听')}
          </Typography.Text>
        </div>
        <Tooltip title="收藏功能请在歌曲列表中使用爱心按钮">
          <Button className="shrink-0" type="text" shape="circle" disabled icon={<HeartOutlined />} />
        </Tooltip>
      </div>

      <div className="absolute left-1/2 top-1/2 hidden w-[min(560px,46vw)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 md:flex">
        <div className="flex items-center gap-1">
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
        <div className="flex w-full items-center gap-3">
          <Typography.Text type="secondary" className="!text-xs">
            {formatTime(currentTime)}
          </Typography.Text>
          <Slider
            className="!mb-0 flex-1"
            disabled={!currentSong}
            min={0}
            max={totalDuration || 1}
            value={Math.min(currentTime, totalDuration || 0)}
            tooltip={{ open: false }}
            onChange={handleSeek}
          />
          <Typography.Text type="secondary" className="!text-xs">
            {formatTime(totalDuration)}
          </Typography.Text>
        </div>
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
