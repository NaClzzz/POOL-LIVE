'use client'

import { Slider, Typography } from 'antd'
import { memo, useEffect, useState } from 'react'

import { getRoomPlaybackPositionMs } from '@/lib/room/playback'
import type { RoomPlaybackState } from '@/types/room'

// 用于房间播放器中独立计算和展示服务端时间轴进度的属性。
type RoomPlaybackProgressProps = Pick<
  RoomPlaybackState,
  'durationMs' | 'startOffsetMs' | 'startedAt' | 'status'
> & {
  canUseRoom: boolean
}

function formatTime(time: number) {
  if (!Number.isFinite(time) || time < 0) return '00:00'

  const totalSeconds = Math.floor(time)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${String(minutes).padStart(2, '0')}:${seconds}`
}

function RoomPlaybackProgressComponent({
  canUseRoom,
  durationMs,
  startOffsetMs,
  startedAt,
  status,
}: RoomPlaybackProgressProps) {
  const [displayPosition, setDisplayPosition] = useState(0)
  const duration = durationMs / 1000

  useEffect(() => {
    const updatePosition = () =>
      setDisplayPosition(
        getRoomPlaybackPositionMs(
          canUseRoom ? { durationMs, startOffsetMs, startedAt, status } : null,
        ) / 1000,
      )
    const initialFrame = requestAnimationFrame(updatePosition)
    const timer = window.setInterval(updatePosition, 250)

    return () => {
      cancelAnimationFrame(initialFrame)
      window.clearInterval(timer)
    }
  }, [canUseRoom, durationMs, startOffsetMs, startedAt, status])

  return (
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
        {status === 'playing' ? '房间正在按固定上台顺序自动轮播' : '等待上台成员准备歌曲'}
      </Typography.Text>
    </div>
  )
}

// 高频房间进度刷新只重新渲染进度区域，不影响投票、红心或歌单控制。
export const RoomPlaybackProgress = memo(RoomPlaybackProgressComponent)
