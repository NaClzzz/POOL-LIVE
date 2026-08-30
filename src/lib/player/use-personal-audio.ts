'use client'

import { useCallback, useEffect, useRef } from 'react'

import { usePlayerStore } from '@/store/player-store'
import type { PlayerSong } from '@/types/player'

// 用于读取个人歌曲播放地址接口的响应数据。
type PlayUrlResponse = {
  data?: Array<{ url: string | null }>
  message?: string
}

// 用于个人播放器音频元素、加载状态和控制函数的 Hook 返回值。
type UsePersonalAudioResult = {
  audioRef: React.RefObject<HTMLAudioElement | null>
  audioUrl: string | null
  isLoadingAudio: boolean
  isPlaying: boolean
  handleAudioEnded: () => void
  handleAudioError: () => void
  handleLoadedMetadata: (event: React.SyntheticEvent<HTMLAudioElement>) => void
  loadAudioForSong: (song: PlayerSong, shouldPlay: boolean) => Promise<void>
  seek: (value: number | number[]) => void
  togglePlayback: (song: PlayerSong | null) => void
}

// 用于隔离个人播放器的原生 audio 生命周期、音源请求和播放控制。
export function usePersonalAudio(): UsePersonalAudioResult {
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioRequestIdRef = useRef(0)
  const audioUrl = usePlayerStore(state => state.audioUrl)
  const isPlaying = usePlayerStore(state => state.isPlaying)
  const isLoadingAudio = usePlayerStore(state => state.isLoadingAudio)
  const volume = usePlayerStore(state => state.volume)
  const nextSong = usePlayerStore(state => state.nextSong)
  const setAudioSource = usePlayerStore(state => state.setAudioSource)
  const setCurrentTime = usePlayerStore(state => state.setCurrentTime)
  const setDuration = usePlayerStore(state => state.setDuration)
  const setIsLoadingAudio = usePlayerStore(state => state.setIsLoadingAudio)
  const setIsPlaying = usePlayerStore(state => state.setIsPlaying)
  const setPlaybackError = usePlayerStore(state => state.setPlaybackError)

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
    return () => audio?.pause()
  }, [])

  const loadAudioForSong = useCallback(
    async (song: PlayerSong, shouldPlay: boolean) => {
      const requestId = audioRequestIdRef.current + 1
      audioRequestIdRef.current = requestId
      setIsLoadingAudio(true)
      setPlaybackError(null)
      setIsPlaying(false)

      try {
        const response = await fetch(`/api/music/play-url/${song.id}`)
        const data = (await response.json()) as PlayUrlResponse
        const nextAudioUrl = data.data?.[0]?.url

        if (!response.ok) throw new Error(data.message || '获取播放地址失败，请稍后再试')
        if (!nextAudioUrl) throw new Error('这首歌暂时无法播放，可能受版权或会员限制。')
        if (audioRequestIdRef.current !== requestId) return

        const audio = audioRef.current
        if (audio) {
          audio.pause()
          audio.src = nextAudioUrl
          audio.load()
        }

        setAudioSource(nextAudioUrl, shouldPlay)
      } catch (error) {
        if (audioRequestIdRef.current !== requestId) return
        setPlaybackError(error instanceof Error ? error.message : '歌曲播放失败，请稍后再试')
      } finally {
        if (audioRequestIdRef.current === requestId) setIsLoadingAudio(false)
      }
    },
    [setAudioSource, setIsLoadingAudio, setIsPlaying, setPlaybackError],
  )

  const togglePlayback = useCallback(
    (song: PlayerSong | null) => {
      if (!song) return

      if (isPlaying) {
        setIsPlaying(false)
        return
      }

      if (audioUrl) {
        setPlaybackError(null)
        setIsPlaying(true)
        return
      }

      void loadAudioForSong(song, true)
    },
    [audioUrl, isPlaying, loadAudioForSong, setIsPlaying, setPlaybackError],
  )

  const seek = useCallback(
    (value: number | number[]) => {
      const nextTime = Array.isArray(value) ? value[0] : value
      const audio = audioRef.current
      if (!audio || typeof nextTime !== 'number') return

      audio.currentTime = nextTime
      setCurrentTime(nextTime)
    },
    [setCurrentTime],
  )

  const handleAudioEnded = useCallback(() => {
    const nextQueueSong = nextSong()

    if (nextQueueSong) {
      void loadAudioForSong(nextQueueSong, true)
      return
    }

    const audio = audioRef.current
    if (audio) audio.currentTime = 0
    setCurrentTime(0)
    setIsPlaying(false)
  }, [loadAudioForSong, nextSong, setCurrentTime, setIsPlaying])

  const handleAudioError = useCallback(() => {
    setIsPlaying(false)
    setPlaybackError('歌曲播放失败，可能是音源失效或受版权限制。')
  }, [setIsPlaying, setPlaybackError])

  const handleLoadedMetadata = useCallback(
    (event: React.SyntheticEvent<HTMLAudioElement>) => setDuration(event.currentTarget.duration),
    [setDuration],
  )

  return {
    audioRef,
    audioUrl,
    isLoadingAudio,
    isPlaying,
    handleAudioEnded,
    handleAudioError,
    handleLoadedMetadata,
    loadAudioForSong,
    seek,
    togglePlayback,
  }
}
