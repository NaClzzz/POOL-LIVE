'use client'

import { useEffect, useRef, useState } from 'react'

import { getRoomPlaybackPositionMs } from '@/lib/room/playback'
import type { RoomPlaybackState } from '@/types/room'

// 用于保存普通 LRC 歌词行的开始时间、原文和可选翻译。
type ParsedLyricLine = {
  timeMs: number
  text: string
  translation?: string
}

// 用于接收 /lyric 接口返回的普通原文歌词和翻译歌词。
type LyricResponse = {
  lrc?: { lyric?: string }
  tlyric?: { lyric?: string }
}

// 用于控制房间三组同步滚动歌词的当前播放状态。
type RoomLyricsProps = {
  playback: RoomPlaybackState | null
}

const TRANSLATION_MATCH_TOLERANCE_MS = 500
const LYRIC_ROW_HEIGHT = 58

function parseTimestamp(minutes: string, seconds: string, fraction = '') {
  const minuteValue = Number(minutes)
  const secondValue = Number(seconds)
  const fractionValue = Number(fraction.padEnd(3, '0').slice(0, 3))

  if (
    !Number.isFinite(minuteValue) ||
    !Number.isFinite(secondValue) ||
    !Number.isFinite(fractionValue) ||
    secondValue >= 60
  ) {
    return null
  }

  return (minuteValue * 60 + secondValue) * 1000 + fractionValue
}

function parseLrc(value: string | undefined) {
  if (!value) return []

  const timestampPattern = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g
  const lines: ParsedLyricLine[] = []

  for (const rawLine of value.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(timestampPattern)]
    if (matches.length === 0) continue

    const text = rawLine.replace(timestampPattern, '').trim()
    if (!text || text.startsWith('{')) continue

    for (const match of matches) {
      const timeMs = parseTimestamp(match[1], match[2], match[3])
      if (timeMs !== null) lines.push({ timeMs, text })
    }
  }

  return lines.sort((left, right) => left.timeMs - right.timeMs)
}

function mergeTranslations(lines: ParsedLyricLine[], translations: ParsedLyricLine[]) {
  if (translations.length === 0) return lines

  return lines.map(line => {
    let nearest: ParsedLyricLine | undefined
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const translation of translations) {
      const distance = Math.abs(translation.timeMs - line.timeMs)
      if (distance < nearestDistance) {
        nearest = translation
        nearestDistance = distance
      }
      if (translation.timeMs > line.timeMs && distance > nearestDistance) break
    }

    return nearest && nearestDistance <= TRANSLATION_MATCH_TOLERANCE_MS
      ? { ...line, translation: nearest.text }
      : line
  })
}

function findCurrentLyricIndex(lines: ParsedLyricLine[], positionMs: number) {
  if (lines.length === 0) return -1

  let low = 0
  let high = lines.length - 1
  let result = 0

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    if (lines[middle].timeMs <= positionMs) {
      result = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return result
}

function lyricStatusText(status: 'idle' | 'loading' | 'error' | 'ready', hasSong: boolean, hasLines: boolean) {
  if (!hasSong) return '等待上台成员准备歌曲'
  if (status === 'loading') return '正在加载歌词'
  if (status === 'error') return '暂时无法获取歌词'
  if (!hasLines) return '暂无可同步歌词'
  return null
}

export function RoomLyrics({ playback }: RoomLyricsProps) {
  const lyricCacheRef = useRef(new Map<number, ParsedLyricLine[]>())
  const [lines, setLines] = useState<ParsedLyricLine[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle')
  const [loadedSongId, setLoadedSongId] = useState<number | null>(null)
  const [positionMs, setPositionMs] = useState(0)
  const songId = playback?.song?.id ?? null

  useEffect(() => {
    if (!songId) return
    const targetSongId = songId

    const cached = lyricCacheRef.current.get(targetSongId)
    if (cached) {
      let isCurrent = true
      queueMicrotask(() => {
        if (!isCurrent) return
        setLines(cached)
        setStatus('ready')
        setLoadedSongId(targetSongId)
      })
      return () => {
        isCurrent = false
      }
    }

    const controller = new AbortController()

    async function loadLyrics() {
      try {
        const response = await fetch(`/api/music/lyric/${targetSongId}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        const data = (await response.json()) as LyricResponse
        if (!response.ok) throw new Error('歌词接口请求失败')

        const parsedLines = mergeTranslations(parseLrc(data.lrc?.lyric), parseLrc(data.tlyric?.lyric))
        lyricCacheRef.current.set(targetSongId, parsedLines)
        setLines(parsedLines)
        setStatus('ready')
        setLoadedSongId(targetSongId)
      } catch {
        if (controller.signal.aborted) return
        setLines([])
        setStatus('error')
        setLoadedSongId(targetSongId)
      }
    }

    void loadLyrics()
    return () => controller.abort()
  }, [songId])

  useEffect(() => {
    const updatePosition = () => setPositionMs(getRoomPlaybackPositionMs(playback))
    updatePosition()
    const timer = window.setInterval(updatePosition, 250)
    return () => window.clearInterval(timer)
  }, [playback])

  const hasCurrentSongLyrics = songId !== null && loadedSongId === songId
  const currentLines = hasCurrentSongLyrics ? lines : []
  const currentStatus = hasCurrentSongLyrics ? status : songId ? 'loading' : 'idle'
  const currentIndex = findCurrentLyricIndex(currentLines, positionMs)
  const statusText = lyricStatusText(currentStatus, Boolean(songId), currentLines.length > 0)
  const trackOffset = currentIndex < 0 ? 0 : currentIndex * LYRIC_ROW_HEIGHT + LYRIC_ROW_HEIGHT / 2

  return (
    <div className="relative h-[174px] overflow-hidden" aria-live="polite" aria-label="同步歌词">
      {statusText ? (
        <div className="flex h-full items-center justify-center text-sm text-[#71808a]">{statusText}</div>
      ) : (
        <div
          className="absolute left-0 right-0 top-1/2"
          style={{
            transform: `translateY(-${trackOffset}px)`,
            transition: 'transform 300ms ease-in-out',
          }}
        >
          {currentLines.map((line, index) => {
            const isCurrent = index === currentIndex
            return (
              <div
                key={`${line.timeMs}-${line.text}-${index}`}
                className={`flex h-[58px] flex-col items-center justify-center px-4 text-center ${
                  isCurrent ? 'opacity-100' : 'opacity-35'
                }`}
              >
                <p className={`m-0 w-full truncate ${isCurrent ? 'text-base font-semibold text-[#1e88e5]' : 'text-sm text-[#71808a]'}`}>
                  {line.text}
                </p>
                {line.translation ? (
                  <p className={`m-0 mt-1 w-full truncate text-xs ${isCurrent ? 'text-[#6aaee0]' : 'text-[#a1adb4]'}`}>
                    {line.translation}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
