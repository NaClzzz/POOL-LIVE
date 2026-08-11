'use client'

import {
  DeleteOutlined,
  HeartFilled,
  ImportOutlined,
  PlayCircleFilled,
  RobotOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { Alert, Avatar, Button, Card, Input, List, Popconfirm, Space, Spin, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'

import { PageHeading } from '@/components/layout/page-heading'
import {
  LIKED_SONGS_CHANGED_EVENT,
  type LikedSongsChangedDetail,
} from '@/lib/liked-songs/client-events'
import { usePlayerStore } from '@/store/player-store'
import type { LikedSong, LikedSongInput } from '@/types/liked-song'

type PlaylistSong = {
  id: number
  name: string
  dt?: number
  ar?: Array<{ name: string }>
  al?: {
    name?: string
    picUrl?: string
  }
}

type PlaylistTracksResponse = {
  songs?: PlaylistSong[]
  message?: string
}

type LikesResponse = {
  songs?: LikedSong[]
  message?: string
}

type ImportLikesResponse = {
  addedSongIds?: number[]
  addedCount?: number
  skippedCount?: number
  message?: string
}

type MutationResponse = {
  deletedCount?: number
  message?: string
}

type PlayUrlResponse = {
  data?: Array<{
    url: string | null
  }>
  message?: string
}

type AnalysisErrorResponse = {
  message?: string
}

function formatDuration(duration: number) {
  const totalSeconds = Math.floor(duration / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${minutes}:${seconds}`
}

function extractPlaylistId(value: string) {
  const trimmedValue = value.trim()

  if (/^\d+$/.test(trimmedValue)) return trimmedValue

  return trimmedValue.match(/[?&]id=(\d+)/)?.[1] ?? null
}

function makeLikedSong(song: PlaylistSong): LikedSongInput {
  return {
    song_id: song.id,
    name: song.name,
    artists: song.ar?.map(artist => artist.name).filter(Boolean).join(' / ') || '未知歌手',
    album_name: song.al?.name || '未知专辑',
    cover_url: song.al?.picUrl ?? null,
    duration_ms: Number.isFinite(song.dt) && song.dt! >= 0 ? song.dt! : 0,
  }
}

export default function LibraryPage() {
  const [likedSongs, setLikedSongs] = useState<LikedSong[]>([])
  const [playlistInput, setPlaylistInput] = useState('')
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true)
  const [isImporting, setIsImporting] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [playingSongId, setPlayingSongId] = useState<number | null>(null)
  const [removingSongId, setRemovingSongId] = useState<number | null>(null)
  const [libraryError, setLibraryError] = useState('')
  const [actionError, setActionError] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [likedAnalysis, setLikedAnalysis] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false)
  const analysisAbortRef = useRef<AbortController | null>(null)
  const startQueue = usePlayerStore(state => state.startQueue)
  const playbackMode = usePlayerStore(state => state.playbackMode)

  useEffect(() => {
    let isCurrent = true

    async function loadLikedSongs() {
      try {
        const response = await fetch('/api/likes')
        const data = (await response.json()) as LikesResponse

        if (!response.ok) {
          throw new Error(data.message || '读取喜欢的音乐失败，请稍后再试。')
        }

        if (!isCurrent) return

        setLikedSongs(data.songs ?? [])
      } catch (error) {
        if (!isCurrent) return

        setLibraryError(error instanceof Error ? error.message : '读取喜欢的音乐失败，请稍后再试。')
      } finally {
        if (isCurrent) setIsLoadingLibrary(false)
      }
    }

    void loadLikedSongs()

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    return () => {
      analysisAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    function handleLikedSongsChanged(event: Event) {
      const detail = (event as CustomEvent<LikedSongsChangedDetail>).detail
      if (!detail?.song) return

      setLikedSongs(previous => {
        if (!detail.isLiked) {
          return previous.filter(song => song.song_id !== detail.song.song_id)
        }

        if (previous.some(song => song.song_id === detail.song.song_id)) return previous

        return [
          {
            ...detail.song,
            created_at: new Date().toISOString(),
          },
          ...previous,
        ]
      })
    }

    window.addEventListener(LIKED_SONGS_CHANGED_EVENT, handleLikedSongsChanged)

    return () => {
      window.removeEventListener(LIKED_SONGS_CHANGED_EVENT, handleLikedSongsChanged)
    }
  }, [])

  async function handleImport() {
    const playlistId = extractPlaylistId(playlistInput)

    if (!playlistId) {
      setActionError('请输入网易云公开歌单 ID，或包含 ?id=歌单ID 的歌单链接。')
      return
    }

    setIsImporting(true)
    setActionError('')
    setImportMessage('')

    try {
      const tracksResponse = await fetch(`/api/music/playlist/${playlistId}/tracks`)
      const tracksData = (await tracksResponse.json()) as PlaylistTracksResponse

      if (!tracksResponse.ok) {
        throw new Error(tracksData.message || '获取歌单歌曲失败。')
      }

      const songs = (tracksData.songs ?? []).filter(song => Number.isSafeInteger(song.id) && song.id > 0)

      if (songs.length === 0) {
        throw new Error('没有获取到可导入的歌曲，请确认歌单 ID 和歌单公开状态。')
      }

      const songsToImport = songs.map(makeLikedSong)
      const importResponse = await fetch('/api/likes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songs: songsToImport }),
      })
      const importData = (await importResponse.json()) as ImportLikesResponse

      if (!importResponse.ok) {
        throw new Error(importData.message || '导入歌曲失败，请稍后再试。')
      }

      const addedSongIds = new Set(importData.addedSongIds ?? [])

      setLikedSongs(previous => {
        const existingSongIds = new Set(previous.map(song => song.song_id))
        const newSongs = songsToImport.filter(
          song => addedSongIds.has(song.song_id) && !existingSongIds.has(song.song_id),
        )

        return [...newSongs, ...previous]
      })
      setImportMessage(
        `成功新增 ${importData.addedCount ?? 0} 首歌曲，跳过 ${importData.skippedCount ?? 0} 首重复歌曲。`,
      )
    } catch (error) {
      setActionError(error instanceof Error ? `导入失败：${error.message}` : '导入失败，请稍后再试。')
    } finally {
      setIsImporting(false)
    }
  }

  async function handlePlay(song: LikedSong) {
    if (playingSongId !== null) return

    setPlayingSongId(song.song_id)
    setActionError('')

    try {
      const response = await fetch(`/api/music/play-url/${song.song_id}`)
      const data = (await response.json()) as PlayUrlResponse
      const audioUrl = data.data?.[0]?.url

      if (!response.ok) {
        throw new Error(data.message || '获取播放地址失败，请稍后再试。')
      }

      if (!audioUrl) {
        throw new Error('这首歌暂时无法播放，可能受版权或会员限制。')
      }

      const queue = likedSongs.map(queueSong => ({
        id: queueSong.song_id,
        name: queueSong.name,
        artists: queueSong.artists,
        albumName: queueSong.album_name,
        coverUrl: queueSong.cover_url ?? undefined,
        duration: queueSong.duration_ms,
      }))
      const queueIndex = queue.findIndex(queueSong => queueSong.id === song.song_id)

      startQueue(queue, queueIndex, audioUrl, 'liked', playbackMode)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '歌曲播放失败，请稍后再试。')
    } finally {
      setPlayingSongId(null)
    }
  }

  async function handleRemove(songId: number) {
    if (removingSongId !== null) return

    setRemovingSongId(songId)
    setActionError('')

    try {
      const response = await fetch(`/api/likes/${songId}`, { method: 'DELETE' })
      const data = (await response.json()) as MutationResponse

      if (!response.ok) {
        throw new Error(data.message || '移除失败，请稍后再试。')
      }

      setLikedSongs(previous => previous.filter(song => song.song_id !== songId))
    } catch (error) {
      setActionError(error instanceof Error ? `移除失败：${error.message}` : '移除失败，请稍后再试。')
    } finally {
      setRemovingSongId(null)
    }
  }

  async function handleClearLikedSongs() {
    if (likedSongs.length === 0 || isClearing) return

    setIsClearing(true)
    setActionError('')
    setImportMessage('')

    try {
      const response = await fetch('/api/likes', { method: 'DELETE' })
      const data = (await response.json()) as MutationResponse

      if (!response.ok) {
        throw new Error(data.message || '清空失败，请稍后再试。')
      }

      setLikedSongs([])
      analysisAbortRef.current?.abort()
      setLikedAnalysis('')
      setAnalysisError('')
      setImportMessage('已清空我喜欢的音乐。')
    } catch (error) {
      setActionError(error instanceof Error ? `清空失败：${error.message}` : '清空失败，请稍后再试。')
    } finally {
      setIsClearing(false)
    }
  }

  async function handleGenerateLikedAnalysis() {
    if (isGeneratingAnalysis || likedSongs.length === 0) return

    const controller = new AbortController()
    analysisAbortRef.current = controller
    setIsGeneratingAnalysis(true)
    setLikedAnalysis('')
    setAnalysisError('')

    try {
      const response = await fetch('/api/ai/liked-playlist-analysis', {
        method: 'POST',
        signal: controller.signal,
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as AnalysisErrorResponse
        throw new Error(data.message || '生成赏析失败，请稍后再试。')
      }

      if (!response.body) {
        throw new Error('没有收到赏析内容，请稍后再试。')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let text = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        text += decoder.decode(value, { stream: true })
        setLikedAnalysis(text)
      }

      text += decoder.decode()
      setLikedAnalysis(text)
    } catch (error) {
      if (controller.signal.aborted) {
        setAnalysisError('已取消生成。')
      } else {
        setAnalysisError(error instanceof Error ? error.message : '生成赏析失败，请稍后再试。')
      }
    } finally {
      if (analysisAbortRef.current === controller) {
        analysisAbortRef.current = null
        setIsGeneratingAnalysis(false)
      }
    }
  }

  function handleCancelLikedAnalysis() {
    analysisAbortRef.current?.abort()
  }

  return (
    <main className="desktop-page">
      <PageHeading
        eyebrow="MY FAVORITE MUSIC"
        title="我喜欢的音乐"
        description="搜索时点亮爱心收藏歌曲，或在这里导入网易云公开歌单。"
      />

      <Card className="mb-6" title="导入网易云歌单" styles={{ body: { padding: 28 } }}>
        <Space.Compact className="w-full">
          <Input
            size="large"
            allowClear
            value={playlistInput}
            disabled={isImporting}
            placeholder="粘贴网易云公开歌单链接，或直接输入歌单 ID"
            onChange={event => setPlaylistInput(event.target.value)}
            onPressEnter={() => void handleImport()}
          />
          <Button
            size="large"
            type="primary"
            icon={<ImportOutlined />}
            loading={isImporting}
            disabled={!playlistInput.trim()}
            onClick={() => void handleImport()}
          >
            导入
          </Button>
        </Space.Compact>
        <Typography.Text type="secondary" className="mt-3 block">
          例如：3778678，或 https://music.163.com/#/playlist?id=3778678。
        </Typography.Text>
      </Card>

      {libraryError ? <Alert className="mb-6" type="error" showIcon message={libraryError} /> : null}
      {actionError ? <Alert className="mb-6" type="error" showIcon message={actionError} /> : null}
      {importMessage ? <Alert className="mb-6" type="success" showIcon message={importMessage} /> : null}

      <Card className="mb-6" title="AI 赏析" styles={{ body: { padding: 28 } }}>
        <Typography.Paragraph className="!mb-5 !max-w-3xl !leading-8 !text-[#71808a]">
          读取你当前喜欢列表中的歌曲，生成一次歌单赏析。
        </Typography.Paragraph>
        <Space wrap>
          <Button
            type="primary"
            icon={<RobotOutlined />}
            loading={isGeneratingAnalysis}
            disabled={isLoadingLibrary || likedSongs.length === 0}
            onClick={() => void handleGenerateLikedAnalysis()}
          >
            生成我的歌单赏析
          </Button>
          {isGeneratingAnalysis ? (
            <Button icon={<StopOutlined />} onClick={handleCancelLikedAnalysis}>
              取消生成
            </Button>
          ) : null}
        </Space>
        {analysisError ? <Alert className="mt-5" type="error" showIcon message={analysisError} /> : null}
        {likedAnalysis ? (
          <Typography.Paragraph className="!mb-0 !mt-5 !whitespace-pre-wrap !leading-8 !text-[#34454f]">
            {likedAnalysis}
          </Typography.Paragraph>
        ) : null}
      </Card>

      <Card
        styles={{ body: { padding: 24 } }}
        title={
          <Space>
            <HeartFilled className="text-[#42a5f5]" />
            <span>我喜欢的音乐</span>
            {!isLoadingLibrary ? <Typography.Text type="secondary">{likedSongs.length} 首</Typography.Text> : null}
          </Space>
        }
        extra={
          <Popconfirm
            title="清空我喜欢的音乐？"
            description={`将删除这 ${likedSongs.length} 首收藏歌曲，此操作无法撤销。`}
            okText="确认清空"
            okButtonProps={{ danger: true, loading: isClearing }}
            cancelText="取消"
            onConfirm={() => void handleClearLikedSongs()}
          >
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              loading={isClearing}
              disabled={likedSongs.length === 0 || isClearing}
            >
              清空
            </Button>
          </Popconfirm>
        }
      >
        {isLoadingLibrary ? (
          <div className="flex justify-center py-16">
            <Spin size="large" />
          </div>
        ) : (
          <List
            locale={{ emptyText: '还没有喜欢的歌曲，去搜索页点亮爱心吧。' }}
            rowKey="song_id"
            dataSource={likedSongs}
            renderItem={(song, index) => (
              <List.Item
                actions={[
                  <Typography.Text key="duration" type="secondary">
                    {formatDuration(song.duration_ms)}
                  </Typography.Text>,
                  <Button
                    key="play"
                    type="text"
                    shape="circle"
                    aria-label="播放歌曲"
                    title="播放"
                    loading={playingSongId === song.song_id}
                    disabled={playingSongId !== null}
                    onClick={() => void handlePlay(song)}
                    icon={<PlayCircleFilled className="!text-[#42a5f5]" />}
                  />,
                  <Button
                    key="remove"
                    type="text"
                    danger
                    shape="circle"
                    aria-label="移除喜欢的音乐"
                    title="移除"
                    loading={removingSongId === song.song_id}
                    disabled={removingSongId !== null}
                    onClick={() => void handleRemove(song.song_id)}
                    icon={<DeleteOutlined />}
                  />,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <div className="flex h-10 items-center gap-3">
                      <Typography.Text type="secondary" className="w-6 text-right text-xs">
                        {String(index + 1).padStart(2, '0')}
                      </Typography.Text>
                      <Avatar shape="square" src={song.cover_url ?? undefined}>
                        {song.name.slice(0, 1)}
                      </Avatar>
                    </div>
                  }
                  title={song.name}
                  description={`${song.artists} · ${song.album_name}`}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </main>
  )
}
