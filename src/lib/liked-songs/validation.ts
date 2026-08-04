import 'server-only'

import type { LikedSongInput } from '@/types/liked-song'

export class LikedSongValidationError extends Error {}

function getRequiredText(value: unknown, fieldName: string) {
  if (typeof value !== 'string') {
    throw new LikedSongValidationError(`${fieldName} 格式不正确。`)
  }

  const text = value.trim()

  if (!text || text.length > 300) {
    throw new LikedSongValidationError(`${fieldName} 长度不正确。`)
  }

  return text
}

function getCoverUrl(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value !== 'string' || value.length > 2_000) {
    throw new LikedSongValidationError('歌曲封面地址格式不正确。')
  }

  try {
    const url = new URL(value)

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error()
    }

    return url.toString()
  } catch {
    throw new LikedSongValidationError('歌曲封面地址格式不正确。')
  }
}

export function parseLikedSongInput(value: unknown): LikedSongInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LikedSongValidationError('请求数据格式不正确。')
  }

  const input = value as Record<string, unknown>
  const songId = Number(input.song_id)
  const durationMs = Number(input.duration_ms)

  if (!Number.isSafeInteger(songId) || songId <= 0) {
    throw new LikedSongValidationError('歌曲 ID 格式不正确。')
  }

  if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
    throw new LikedSongValidationError('歌曲时长格式不正确。')
  }

  return {
    song_id: songId,
    name: getRequiredText(input.name, '歌曲名称'),
    artists: getRequiredText(input.artists, '歌手名称'),
    album_name: getRequiredText(input.album_name, '专辑名称'),
    cover_url: getCoverUrl(input.cover_url),
    duration_ms: durationMs,
  }
}
