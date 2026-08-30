'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { getRoomPlaybackPositionMs } from '@/lib/room/playback'
import { useRoomRealtimeStore } from '@/store/room-realtime-store'
import type { RoomPlaybackState } from '@/types/room'

// 用于读取房间歌曲播放地址接口的响应数据。
type PlayUrlResponse = {
  data?: Array<{ url: string | null }>
  message?: string
}

// 用于房间音频同步 Hook 接收服务端节目状态和媒体错误上报回调的参数。
type UseRoomAudioSyncOptions = {
  canUseRoom: boolean
  playbackSongId: number | null
  playbackStatus: RoomPlaybackState['status']
  playbackVersion: number | null
  volume: number
  onMediaError: () => void
}

// 用于房间音频同步 Hook 返回媒体元素、错误状态和浏览器自动播放解锁操作。
type UseRoomAudioSyncResult = {
  audioError: string | null
  audioRef: React.RefObject<HTMLAudioElement | null>
  handleAudioError: () => void
  needsAudioUnlock: boolean
  unlockAudio: () => void
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
      reject(new DOMException('Room audio loading was cancelled.', 'AbortError'))
    }

    const cleanup = () => {
      window.clearTimeout(timeout)
      signal.removeEventListener('abort', handleAbort)
    }

    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

// 用于让原生 audio 按房间节目版本、统一开始时间和服务端进度播放。
export function useRoomAudioSync({
  canUseRoom,
  playbackSongId,
  playbackStatus,
  playbackVersion,
  volume,
  onMediaError,
}: UseRoomAudioSyncOptions): UseRoomAudioSyncResult {
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioRequestIdRef = useRef(0)
  const onMediaErrorRef = useRef(onMediaError)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false)

  useEffect(() => {
    onMediaErrorRef.current = onMediaError
  }, [onMediaError])

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
    return () => abortController.abort()
  }, [canUseRoom, playbackSongId, playbackStatus, playbackVersion])

  useEffect(() => {
    const audio = audioRef.current
    return () => audio?.pause()
  }, [])

  const handleAudioError = useCallback(() => {
    setAudioError('歌曲播放失败，正在尝试跳过。')
    onMediaErrorRef.current()
  }, [])

  const unlockAudio = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    void audio.play().then(
      () => {
        setNeedsAudioUnlock(false)
        setAudioError(null)
      },
      () => setNeedsAudioUnlock(true),
    )
  }, [])

  return { audioError, audioRef, handleAudioError, needsAudioUnlock, unlockAudio }
}
