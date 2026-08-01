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
import { createClient } from '@/lib/supabase/client'
import { usePlayerStore } from '@/store/player-store'
import type { LikedSong } from '@/types/liked-song'

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

function makeLikedSong(song: PlaylistSong, userId: string): LikedSong {
  return {
    user_id: userId,
    song_id: song.id,
    name: song.name,
    artists: song.ar?.map(artist => artist.name).filter(Boolean).join(' / ') || '未知歌手',
    album_name: song.al?.name || '未知专辑',
    cover_url: song.al?.picUrl ?? null,
    duration_ms: Number.isFinite(song.dt) && song.dt! >= 0 ? song.dt! : 0,
  }
}

export default function LibraryPage() {
  const [supabase] = useState(createClient)
  const [likedSongs, setLikedSongs] = useState<LikedSong[]>([])
  const [userId, setUserId] = useState<string | null>(null)
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

  useEffect(() => {
    let isCurrent = true

    async function loadLikedSongs() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (!isCurrent) return

      if (userError || !user) {
        setLibraryError('读取喜欢的音乐失败：登录状态已失效，请重新登录。')
        setIsLoadingLibrary(false)
        return
      }

      setUserId(user.id)

      const { data, error } = await supabase
        .from('liked_songs')
        .select('*')
        .order('created_at', { ascending: false })

      if (!isCurrent) return

      if (error) {
        setLibraryError(`读取喜欢的音乐失败：${error.message}`)
        setIsLoadingLibrary(false)
        return
      }

      setLikedSongs((data ?? []) as LikedSong[])
      setIsLoadingLibrary(false)
    }

    void loadLikedSongs()

    return () => {
      isCurrent = false
    }
  }, [supabase])

  useEffect(() => {
    return () => {
      analysisAbortRef.current?.abort()
    }
  }, [])

  async function handleImport() {
    const playlistId = extractPlaylistId(playlistInput)

    if (!playlistId) {
      setActionError('请输入网易云公开歌单 ID，或包含 ?id=歌单ID 的歌单链接。')
      return
    }

    if (!userId) {
      setActionError('登录状态已失效，请重新登录后再导入。')
      return
    }

    setIsImporting(true)
    setActionError('')
    setImportMessage('')

    try {
      const response = await fetch(`/api/music/playlist/${playlistId}/tracks`)
      const data = (await response.json()) as PlaylistTracksResponse

      if (!response.ok) {
        throw new Error(data.message || '获取歌单歌曲失败')
      }

      const songs = (data.songs ?? []).filter(song => Number.isSafeInteger(song.id) && song.id > 0)

      if (songs.length === 0) {
        throw new Error('没有获取到可导入的歌曲，请确认歌单 ID 和歌单公开状态。')
      }

      const songsToImport = songs.map(song => makeLikedSong(song, userId))
      const { error } = await supabase.from('liked_songs').upsert(songsToImport, {
        onConflict: 'user_id,song_id',
        ignoreDuplicates: true,
      })

      if (error) throw error

      setLikedSongs(previous => {
        const existingSongIds = new Set(previous.map(song => song.song_id))
        const newSongs = songsToImport.filter(song => !existingSongIds.has(song.song_id))

        return [...newSongs, ...previous]
      })
      setImportMessage(`已尝试导入 ${songsToImport.length} 首歌曲，重复歌曲会自动跳过。`)
    } catch (error) {
      setActionError(error instanceof Error ? `导入失败：${error.message}` : '导入失败，请稍后再试')
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
        throw new Error(data.message || '获取播放地址失败，请稍后再试')
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

      startQueue(queue, queueIndex, audioUrl)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '歌曲播放失败，请稍后再试')
    } finally {
      setPlayingSongId(null)
    }
  }

  async function handleRemove(songId: number) {
    if (!userId || removingSongId !== null) return

    setRemovingSongId(songId)
    setActionError('')

    try {
      const { error } = await supabase
        .from('liked_songs')
        .delete()
        .eq('user_id', userId)
        .eq('song_id', songId)

      if (error) throw error

      setLikedSongs(previous => previous.filter(song => song.song_id !== songId))
    } catch (error) {
      setActionError(error instanceof Error ? `移除失败：${error.message}` : '移除失败，请稍后再试')
    } finally {
      setRemovingSongId(null)
    }
  }

  async function handleClearLikedSongs() {
    if (!userId || likedSongs.length === 0 || isClearing) return

    setIsClearing(true)
    setActionError('')
    setImportMessage('')

    try {
      const { error } = await supabase
        .from('liked_songs')
        .delete()
        .eq('user_id', userId)

      if (error) throw error

      setLikedSongs([])
      analysisAbortRef.current?.abort()
      setLikedAnalysis('')
      setAnalysisError('')
      setImportMessage('已清空我喜欢的音乐。')
    } catch (error) {
      setActionError(error instanceof Error ? `清空失败：${error.message}` : '清空失败，请稍后再试')
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
        eyebrow="我的收藏"
        title="我喜欢的音乐"
        description="搜索时点亮爱心收藏歌曲，也可以导入网易云公开歌单。"
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
          例如：3778678，或 https://music.163.com/#/playlist?id=3778678。首版最多导入前 500 首。
        </Typography.Text>
      </Card>

      {libraryError ? <Alert className="mb-6" type="error" showIcon message={libraryError} /> : null}
      {actionError ? <Alert className="mb-6" type="error" showIcon message={actionError} /> : null}
      {importMessage ? <Alert className="mb-6" type="success" showIcon message={importMessage} /> : null}

      <Card className="mb-6" title="AI 赏析" styles={{ body: { padding: 28 } }}>
        <Typography.Paragraph className="!mb-5 !max-w-3xl !leading-8 !text-[#71808a]">
          将读取你当前喜欢列表中的全部歌名，并随机抽取几首歌的歌词，生成一次不保存的歌单赏析。
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
