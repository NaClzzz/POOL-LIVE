'use client'

import { Slider, Typography } from 'antd'
import { memo } from 'react'

import { usePlayerStore } from '@/store/player-store'
import type { PlayerSong } from '@/types/player'

// 用于个人播放器中独立订阅高频播放进度的进度条属性。
type PlayerProgressProps = {
  currentSong: PlayerSong | null
  onSeek: (value: number | number[]) => void
}

function formatTime(time: number) {
  if (!Number.isFinite(time) || time < 0) return '00:00'

  const totalSeconds = Math.floor(time)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${String(minutes).padStart(2, '0')}:${seconds}`
}

function PlayerProgressComponent({ currentSong, onSeek }: PlayerProgressProps) {
  const currentTime = usePlayerStore(state => state.currentTime)
  const loadedDuration = usePlayerStore(state => state.duration)
  const duration = loadedDuration || (currentSong ? currentSong.duration / 1000 : 0)

  return (
    <div className="flex w-full items-center gap-3">
      <Typography.Text type="secondary" className="!text-xs">
        {formatTime(currentTime)}
      </Typography.Text>
      <Slider
        className="!mb-0 flex-1"
        disabled={!currentSong}
        min={0}
        max={duration || 1}
        value={Math.min(currentTime, duration || 0)}
        tooltip={{ open: false }}
        onChange={onSeek}
      />
      <Typography.Text type="secondary" className="!text-xs">
        {formatTime(duration)}
      </Typography.Text>
    </div>
  )
}

// 高频 currentTime 变化只重新渲染进度区域，不影响整个个人播放栏。
export const PlayerProgress = memo(PlayerProgressComponent)
