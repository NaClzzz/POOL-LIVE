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

type LikesResponse = {
  songs?: LikedSong[]
  message?: string
}

type LikeMutationResponse = {
  message?: string
  created?: boolean
}

const PAGE_SIZE = 20

function formatDuration(duration: number) {
  const totalSeconds = Math.floor(duration / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${minutes}:${seconds}`
}

export default function SearchPage() {
  const [keywords, setKeywords] = useState('')
  const [songs, setSongs] = useState<SearchSong[]>([])
  const [songCount, setSongCount] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchedKeywords, setSearchedKeywords] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [playingSongId, setPlayingSongId] = useState<number | null>(null)
  const [likingSongId, setLikingSongId] = useState<number | null>(null)
  const [likedSongIds, setLikedSongIds] = useState<Set<number>>(new Set())
  const [musicError, setMusicError] = useState('')
  const [likesError, setLikesError] = useState('')
  const startQueue = usePlayerStore(state => state.startQueue)

  useEffect(() => {
    let isCurrent = true

    async function loadLikedSongIds() {
      try {
        const response = await fetch('/api/likes')
        const data = (await response.json()) as LikesResponse

        if (!response.ok) {
          throw new Error(data.message || '读取收藏失败，请稍后再试。')
        }

        if (!isCurrent) return

        setLikedSongIds(new Set((data.songs ?? []).map(song => Number(song.song_id))))
      } catch (error) {
        if (!isCurrent) return

        setLikesError(error instanceof Error ? error.message : '读取收藏失败，请稍后再试。')
      }
    }

    void loadLikedSongIds()

    return () => {
      isCurrent = false
    }
  }, [])

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
    if (likingSongId !== null) return

    setLikingSongId(song.id)
    setLikesError('')

    const likedSong: Omit<LikedSong, 'created_at'> = {
      song_id: song.id,
      name: song.name,
      artists: song.artists.map(artist => artist.name).join(' / ') || '未知歌手',
      album_name: song.album.name || '未知专辑',
      cover_url: song.album.picUrl ?? null,
      duration_ms: song.duration,
    }

    try {
      const response = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(likedSong),
      })
      const data = (await response.json()) as LikeMutationResponse

      if (!response.ok) {
        throw new Error(data.message || '收藏歌曲失败，请稍后再试。')
      }

      setLikedSongIds(previous => new Set(previous).add(song.id))
    } catch (error) {
      setLikesError(error instanceof Error ? `收藏失败：${error.message}` : '收藏失败，请稍后再试')
    } finally {
      setLikingSongId(null)
    }
  }

  async function handleUnlike(songId: number) {
    if (likingSongId !== null) return

    setLikingSongId(songId)
    setLikesError('')

    try {
      const response = await fetch(`/api/likes/${songId}`, { method: 'DELETE' })
      const data = (await response.json()) as LikeMutationResponse

      if (!response.ok) {
        throw new Error(data.message || '取消收藏失败，请稍后再试。')
      }

      setLikedSongIds(previous => {
        const next = new Set(previous)
        next.delete(songId)
        return next
      })
    } catch (error) {
      setLikesError(error instanceof Error ? error.message : '取消收藏失败，请稍后再试。')
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

      startQueue(queue, queueIndex, audioUrl, 'search', 'sequential')
    } catch (error) {
      setMusicError(error instanceof Error ? error.message : '歌曲播放失败，请稍后再试')
    } finally {
      setPlayingSongId(null)
    }
  }

  return (
    <main className="desktop-page">
      <PageHeading
        eyebrow="SEARCH MUSIC"
        title="搜索音乐"
        description="输入关键词，搜索你喜欢的歌曲或歌手。"
      />
      <Card className="mb-6" styles={{ body: { padding: 28 } }}>
        <Space.Compact className="w-full">
          <Input
            size="large"
            placeholder="搜索你喜欢的歌曲或歌手"
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
          styles={{ body: { padding: 24 } }}
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
                      aria-label={isLiked ? '取消收藏歌曲' : '收藏歌曲'}
                      title={isLiked ? '取消收藏' : '收藏到我喜欢的音乐'}
                      loading={likingSongId === song.id}
                      disabled={likingSongId !== null}
                      onClick={() =>
                        void (isLiked ? handleUnlike(song.id) : handleLike(song))
                      }
                      icon={
                        isLiked ? (
                          <HeartFilled className="!text-[#42a5f5]" />
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
                      icon={<PlayCircleFilled className="!text-[#42a5f5]" />}
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
