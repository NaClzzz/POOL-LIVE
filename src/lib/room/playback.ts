import type { RoomPlaybackState } from '@/types/room'

// 根据服务端房间播放时间轴计算客户端当前应显示的播放位置（毫秒）。
export function getRoomPlaybackPositionMs(playback: RoomPlaybackState | null) {
  if (!playback || playback.status !== 'playing' || !playback.startedAt) return 0

  const startedAt = new Date(playback.startedAt).getTime()
  if (Number.isNaN(startedAt)) return 0

  const elapsedMs = Math.max(0, Date.now() - startedAt)
  return Math.min(playback.durationMs, playback.startOffsetMs + elapsedMs)
}
