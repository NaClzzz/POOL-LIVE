'use client'

import {
  HeartFilled,
  HeartOutlined,
  PlayCircleFilled,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Avatar,
  Button,
  Card,
  Input,
  List,
  Pagination,
  Space,
  Spin,
  Typography,
} from 'antd'
import { useEffect, useState } from 'react'

import { PageHeading } from '@/components/layout/page-heading'
import { createClient } from '@/lib/supabase/client'
import { usePlayerStore } from '@/store/player-store'
import type { LikedSong } from '@/types/liked-song'

type SearchSong = {
  id: number
  name: string
  duration: number
  artists: Array<{ name: string }>
  album: {
    name: string
    picUrl?: string
  }
}

type SearchResponse = {
  code: number
  result?: {
    songCount: number
    songs: SearchSong[]
  }
  message?: string
}

type PlayUrlResponse = {
  data?: Array<{
    url: string | null
  }>
  message?: string
}

const PAGE_SIZE = 20

function formatDuration(duration: number) {
  const totalSeconds = Math.floor(duration / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${minutes}:${seconds}`
}

export default function SearchPage() {
  const [supabase] = useState(createClient)
  const [keywords, setKeywords] = useState('')
  const [songs, setSongs] = useState<SearchSong[]>([])
  const [songCount, setSongCount] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchedKeywords, setSearchedKeywords] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [playingSongId, setPlayingSongId] = useState<number | null>(null)
  const [likingSongId, setLikingSongId] = useState<number | null>(null)
  const [likedSongIds, setLikedSongIds] = useState<Set<number>>(new Set())
  const [userId, setUserId] = useState<string | null>(null)
  const [musicError, setMusicError] = useState('')
  const [likesError, setLikesError] = useState('')
  const startQueue = usePlayerStore(state => state.startQueue)

  useEffect(() => {
    let isCurrent = true

    async function loadLikedSongIds() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (!isCurrent) return

      if (userError || !user) {
        setLikesError('登录状态已失效，请重新登录后再收藏歌曲。')
        return
      }

      setUserId(user.id)

      const { data, error } = await supabase.from('liked_songs').select('song_id')

      if (!isCurrent) return

      if (error) {
        setLikesError(`读取收藏失败：${error.message}`)
        return
      }

      setLikedSongIds(new Set((data ?? []).map(song => Number(song.song_id))))
    }

    void loadLikedSongIds()

    return () => {
      isCurrent = false
    }
  }, [supabase])

  async function searchSongs(searchKeywords: string, page: number) {
    if (isLoading) return

    setIsLoading(true)
    setMusicError('')

    try {
      const searchParams = new URLSearchParams({
        keywords: searchKeywords,
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      })
      const response = await fetch(`/api/music/search?${searchParams}`)
      const data = (await response.json()) as SearchResponse

      if (!response.ok) {
        throw new Error(data.message || '搜索失败，请稍后再试')
      }

      setSongs(data.result?.songs ?? [])
      setSongCount(data.result?.songCount ?? 0)
      setCurrentPage(page)
      setSearchedKeywords(searchKeywords)
    } catch (error) {
      setSongs([])
      setSongCount(null)
      setMusicError(error instanceof Error ? error.message : '搜索失败，请稍后再试')
    } finally {
      setIsLoading(false)
    }
  }

  function handleSearch() {
    const trimmedKeywords = keywords.trim()

    if (!trimmedKeywords) return

    void searchSongs(trimmedKeywords, 1)
  }

  function handlePageChange(page: number) {
    if (!searchedKeywords) return

    void searchSongs(searchedKeywords, page)
  }

  async function handleLike(song: SearchSong) {
    if (!userId || likingSongId !== null) {
      if (!userId) setLikesError('登录状态已失效，请重新登录后再收藏歌曲。')
      return
    }

    setLikingSongId(song.id)
    setLikesError('')

    const likedSong: LikedSong = {
      user_id: userId,
      song_id: song.id,
      name: song.name,
      artists: song.artists.map(artist => artist.name).join(' / ') || '未知歌手',
      album_name: song.album.name || '未知专辑',
      cover_url: song.album.picUrl ?? null,
      duration_ms: song.duration,
    }

    try {
      const { error } = await supabase
        .from('liked_songs')
        .upsert(likedSong, {
          onConflict: 'user_id,song_id',
          ignoreDuplicates: true,
        })

      if (error) throw error

      setLikedSongIds(previous => new Set(previous).add(song.id))
    } catch (error) {
      setLikesError(error instanceof Error ? `收藏失败：${error.message}` : '收藏失败，请稍后再试')
    } finally {
      setLikingSongId(null)
    }
  }

  async function handlePlay(song: SearchSong) {
    if (playingSongId !== null) return

    setPlayingSongId(song.id)
    setMusicError('')

    try {
      const response = await fetch(`/api/music/play-url/${song.id}`)
      const data = (await response.json()) as PlayUrlResponse
      const audioUrl = data.data?.[0]?.url

      if (!response.ok) {
        throw new Error(data.message || '获取播放地址失败，请稍后再试')
      }

      if (!audioUrl) {
        throw new Error('这首歌暂时无法播放，可能受版权或会员限制。')
      }

      const queue = songs.map(queueSong => ({
        id: queueSong.id,
        name: queueSong.name,
        artists: queueSong.artists.map(artist => artist.name).join(' / '),
        albumName: queueSong.album.name,
        coverUrl: queueSong.album.picUrl,
        duration: queueSong.duration,
      }))
      const queueIndex = queue.findIndex(queueSong => queueSong.id === song.id)

      startQueue(queue, queueIndex, audioUrl)
    } catch (error) {
      setMusicError(error instanceof Error ? error.message : '歌曲播放失败，请稍后再试')
    } finally {
      setPlayingSongId(null)
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
      <PageHeading
        eyebrow="发现音乐"
        title="搜索音乐"
        description="输入关键词，从本地音乐 API 搜索歌曲、歌手和公开歌单。"
      />
      <Card className="mb-6 shadow-sm">
        <Space.Compact className="w-full">
          <Input
            size="large"
            placeholder="搜索歌曲、歌手或歌单"
            value={keywords}
            onChange={event => setKeywords(event.target.value)}
            onPressEnter={handleSearch}
            disabled={isLoading}
          />
          <Button
            size="large"
            type="primary"
            icon={<SearchOutlined />}
            loading={isLoading}
            disabled={!keywords.trim()}
            onClick={handleSearch}
          >
            搜索
          </Button>
        </Space.Compact>
        <Typography.Text type="secondary" className="mt-3 block">
          例如：周杰伦、晴天、告白气球
        </Typography.Text>
      </Card>

      {likesError ? <Alert className="mb-6" type="error" showIcon message={likesError} /> : null}
      {musicError ? <Alert className="mb-6" type="error" showIcon message={musicError} /> : null}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spin size="large" />
        </div>
      ) : null}

      {!isLoading && songCount !== null ? (
        <Card
          className="shadow-sm"
          title={`搜索结果${songCount > 0 ? `（共 ${songCount} 首）` : ''}`}
        >
          <List
            locale={{ emptyText: '没有找到匹配的歌曲' }}
            rowKey="id"
            dataSource={songs}
            renderItem={song => {
              const isLiked = likedSongIds.has(song.id)

              return (
                <List.Item
                  actions={[
                    <Typography.Text key="duration" type="secondary">
                      {formatDuration(song.duration)}
                    </Typography.Text>,
                    <Button
                      key="like"
                      type="text"
                      shape="circle"
                      aria-label={isLiked ? '已收藏' : '收藏歌曲'}
                      title={isLiked ? '已收藏' : '收藏到我喜欢的音乐'}
                      loading={likingSongId === song.id}
                      disabled={isLiked || likingSongId !== null}
                      onClick={() => void handleLike(song)}
                      icon={
                        isLiked ? (
                          <HeartFilled className="!text-rose-500" />
                        ) : (
                          <HeartOutlined />
                        )
                      }
                    />,
                    <Button
                      key="play"
                      type="text"
                      shape="circle"
                      loading={playingSongId === song.id}
                      disabled={playingSongId !== null}
                      onClick={() => void handlePlay(song)}
                      icon={<PlayCircleFilled className="!text-violet-500" />}
                    />,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar shape="square" src={song.album.picUrl}>
                        {song.name.slice(0, 1)}
                      </Avatar>
                    }
                    title={song.name}
                    description={`${song.artists.map(artist => artist.name).join(' / ')} · ${song.album.name}`}
                  />
                </List.Item>
              )
            }}
          />
          {songCount > PAGE_SIZE ? (
            <div className="mt-6 flex justify-center">
              <Pagination
                current={currentPage}
                pageSize={PAGE_SIZE}
                total={songCount}
                showQuickJumper
                showSizeChanger={false}
                onChange={handlePageChange}
              />
            </div>
          ) : null}
        </Card>
      ) : null}
    </main>
  )
}
