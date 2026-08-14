'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { notifyLikedSongsChanged } from '@/lib/liked-songs/client-events'
import type { LikedSong, LikedSongInput } from '@/types/liked-song'
import type { PlayerSong } from '@/types/player'

// 用于读取当前用户喜欢歌曲列表的接口响应。
type LikesResponse = {
  songs?: LikedSong[]
  message?: string
}

// 用于收藏或取消收藏歌曲的接口响应。
type LikeMutationResponse = {
  message?: string
}

// 用于记录某首歌曲收藏操作失败的提示信息。
type LikeError = {
  songId: number
  message: string
}

function toLikedSongInput(song: PlayerSong): LikedSongInput {
  return {
    song_id: song.id,
    name: song.name,
    artists: song.artists,
    album_name: song.albumName,
    cover_url: song.coverUrl ?? null,
    duration_ms: song.duration,
  }
}

// 供播放栏读取并切换当前歌曲个人收藏状态的客户端 Hook。
export function useCurrentSongLike(song: PlayerSong | null) {
  const currentSongRef = useRef<PlayerSong | null>(song)
  const requestIdRef = useRef(0)
  const [likedSongId, setLikedSongId] = useState<number | null>(null)
  const [pendingSongId, setPendingSongId] = useState<number | null>(null)
  const [error, setError] = useState<LikeError | null>(null)

  useEffect(() => {
    currentSongRef.current = song
  }, [song])

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const controller = new AbortController()

    if (!song) {
      return () => controller.abort()
    }

    const songId = song.id

    async function loadLikeState() {
      try {
        const response = await fetch('/api/likes', { signal: controller.signal })
        const data = (await response.json()) as LikesResponse

        if (!response.ok) {
          throw new Error(data.message || '读取喜欢状态失败')
        }

        if (requestIdRef.current === requestId && currentSongRef.current?.id === songId) {
          setLikedSongId(
            (data.songs ?? []).some(likedSong => likedSong.song_id === songId) ? songId : null,
          )
          setError(null)
        }
      } catch (loadError) {
        if (controller.signal.aborted || requestIdRef.current !== requestId) return

        // 收藏按钮仍可使用，服务端 POST 的幂等写入会给出最终结果。
        setLikedSongId(null)
        setError({
          songId,
          message: loadError instanceof Error ? loadError.message : '读取喜欢状态失败',
        })
      }
    }

    void loadLikeState()

    return () => controller.abort()
  }, [song])

  const toggleLike = useCallback(async () => {
    const currentSong = currentSongRef.current
    if (!currentSong || pendingSongId === currentSong.id) return

    const songId = currentSong.id
    const nextLikedState = likedSongId !== songId
    requestIdRef.current += 1
    setPendingSongId(songId)
    setError(null)

    try {
      const response = nextLikedState
        ? await fetch('/api/likes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toLikedSongInput(currentSong)),
          })
        : await fetch(`/api/likes/${songId}`, { method: 'DELETE' })
      const data = (await response.json()) as LikeMutationResponse

      if (!response.ok) {
        throw new Error(data.message || (nextLikedState ? '收藏歌曲失败' : '取消收藏失败'))
      }

      if (currentSongRef.current?.id === songId) {
        setLikedSongId(nextLikedState ? songId : null)
      }
      notifyLikedSongsChanged({
        isLiked: nextLikedState,
        song: toLikedSongInput(currentSong),
      })
    } catch (mutationError) {
      if (currentSongRef.current?.id === songId) {
        setError({
          songId,
          message: mutationError instanceof Error ? mutationError.message : '更新喜欢状态失败',
        })
      }
    } finally {
      setPendingSongId(previousSongId => (previousSongId === songId ? null : previousSongId))
    }
  }, [likedSongId, pendingSongId])

  return {
    isLiked: likedSongId === song?.id,
    isToggling: pendingSongId === song?.id,
    error: error && error.songId === song?.id ? error.message : null,
    toggleLike,
  }
}
