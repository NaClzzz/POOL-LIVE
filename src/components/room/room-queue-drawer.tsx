'use client'

import {
  ClearOutlined,
  CloseOutlined,
  HolderOutlined,
  ImportOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { Alert, Input, Popconfirm, Spin } from 'antd'
import { useEffect, useState } from 'react'

import type { PlayerSong } from '@/types/player'
import type { UserRoomPlaylistItem } from '@/types/room'

// 用于房间内搜索接口返回的单首歌曲原始数据。
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

// 用于房间内搜索接口的响应数据。
type SearchResponse = {
  result?: {
    songs?: SearchSong[]
  }
  message?: string
}

// 用于房间右侧全局上台歌单抽屉的交互参数。
type RoomQueueDrawerProps = {
  open: boolean
  playlist: UserRoomPlaylistItem[]
  isMutating: boolean
  error: string | null
  onClose: () => void
  onAddSong: (song: PlayerSong) => void
  onRemoveSong: (itemId: string) => void
  onMoveSong: (itemId: string, toIndex: number) => void
  onShuffle: () => void
  onImportLiked: () => void
  onClear: () => void
}

// 用于可拖拽的单个全局上台歌单行。
type SortableRoomSongProps = {
  item: UserRoomPlaylistItem
  index: number
  onRemove: (itemId: string) => void
}

function formatDuration(duration: number) {
  const totalSeconds = Math.floor(duration / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${minutes}:${seconds}`
}

function toPlayerSong(song: SearchSong): PlayerSong {
  return {
    id: song.id,
    name: song.name,
    artists: song.artists.map(artist => artist.name).filter(Boolean).join(' / ') || '未知歌手',
    albumName: song.album.name || '未知专辑',
    coverUrl: song.album.picUrl,
    duration: Number.isFinite(song.duration) && song.duration >= 0 ? song.duration : 0,
  }
}

function SortableRoomSong({ item, index, onRemove }: SortableRoomSongProps) {
  const { handleRef, isDragging, ref } = useSortable({ id: item.itemId, index })

  return (
    <div
      ref={ref}
      className={`grid grid-cols-[24px_40px_1fr_32px_32px] items-center gap-3 border-b border-[#edf0f2] px-2 py-3 ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <span className="text-xs text-[#9aa5ac]">{String(index + 1).padStart(2, '0')}</span>
      <span
        className="grid h-10 w-10 place-items-center overflow-hidden bg-[#eaf6ff] text-sm font-semibold text-[#1e88e5]"
        style={
          item.coverUrl
            ? {
                backgroundImage: `url(${item.coverUrl})`,
                backgroundPosition: 'center',
                backgroundSize: 'cover',
              }
            : undefined
        }
      >
        {item.coverUrl ? null : item.name.slice(0, 1)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-[#222a30]">{item.name}</span>
        <span className="mt-1 block truncate text-xs text-[#71808a]">
          {item.artists} · {formatDuration(item.duration)}
        </span>
      </span>
      <button
        ref={handleRef}
        type="button"
        aria-label={`拖拽排序 ${item.name}`}
        title="拖拽排序"
        className="grid h-8 w-8 place-items-center rounded-full text-[#9aa5ac] hover:bg-[#eaf6ff] hover:text-[#1e88e5]"
      >
        <HolderOutlined />
      </button>
      <button
        type="button"
        onClick={() => onRemove(item.itemId)}
        aria-label={`从上台歌单移除 ${item.name}`}
        className="grid h-8 w-8 place-items-center rounded-full text-lg text-[#9aa5ac] hover:bg-[#fff1f0] hover:text-[#d64545]"
      >
        ×
      </button>
    </div>
  )
}

export function RoomQueueDrawer({
  open,
  playlist,
  isMutating,
  error,
  onClose,
  onAddSong,
  onRemoveSong,
  onMoveSong,
  onShuffle,
  onImportLiked,
  onClear,
}: RoomQueueDrawerProps) {
  const [keywords, setKeywords] = useState('')
  const [searchSongs, setSearchSongs] = useState<PlayerSong[]>([])
  const [searchError, setSearchError] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [shouldRender, setShouldRender] = useState(open)
  const [isVisible, setIsVisible] = useState(open)

  useEffect(() => {
    let revealFrame: number | undefined
    let closeTimeout: number | undefined

    if (open) {
      revealFrame = requestAnimationFrame(() => {
        setShouldRender(true)
        revealFrame = requestAnimationFrame(() => setIsVisible(true))
      })
    } else {
      revealFrame = requestAnimationFrame(() => setIsVisible(false))
      closeTimeout = window.setTimeout(() => setShouldRender(false), 260)
    }

    return () => {
      if (revealFrame) cancelAnimationFrame(revealFrame)
      if (closeTimeout) clearTimeout(closeTimeout)
    }
  }, [open])

  async function handleSearch() {
    const normalizedKeywords = keywords.trim()
    if (!normalizedKeywords || isSearching) return

    setIsSearching(true)
    setSearchError('')

    try {
      const params = new URLSearchParams({ keywords: normalizedKeywords, limit: '20' })
      const response = await fetch(`/api/music/search?${params}`)
      const data = (await response.json()) as SearchResponse
      if (!response.ok) throw new Error(data.message || '搜索歌曲失败，请稍后重试。')

      setSearchSongs((data.result?.songs ?? []).map(toPlayerSong))
    } catch (searchFailure) {
      setSearchSongs([])
      setSearchError(searchFailure instanceof Error ? searchFailure.message : '搜索歌曲失败，请稍后重试。')
    } finally {
      setIsSearching(false)
    }
  }

  if (!shouldRender) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭房间歌单"
        className={`absolute inset-0 bg-[#222a30]/20 transition-opacity duration-[260ms] ease-in-out ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-queue-drawer-title"
        className={`absolute bottom-0 right-0 top-0 flex w-[820px] flex-col border-l border-[#dfe4e7] bg-white transition-transform duration-[260ms] ease-in-out ${
          isVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#dfe4e7] px-6">
          <div>
            <p className="m-0 text-xs font-semibold tracking-[0.16em] text-[#1e88e5]">GLOBAL STAGE PLAYLIST</p>
            <h2 id="room-queue-drawer-title" className="m-0 mt-1 text-lg font-semibold text-[#222a30]">
              我的房间歌单
            </h2>
          </div>
          <button
            type="button"
            aria-label="关闭房间歌单"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-lg text-[#71808a] hover:bg-[#f0f7fc] hover:text-[#222a30]"
          >
            <CloseOutlined />
          </button>
        </header>

        {error ? <Alert className="mx-5 mt-4" type="error" showIcon message={error} /> : null}

        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-[#dfe4e7]">
          <section className="flex min-h-0 flex-col">
            <div className="border-b border-[#edf0f2] px-5 py-4">
              <p className="m-0 text-sm font-semibold text-[#34454f]">房间内搜歌</p>
              <Input
                className="mt-3"
                prefix={<SearchOutlined className="text-[#9aa5ac]" />}
                suffix={isSearching ? <Spin size="small" /> : null}
                placeholder="搜索歌名或歌手"
                value={keywords}
                onChange={event => setKeywords(event.target.value)}
                onPressEnter={() => void handleSearch()}
              />
              {searchError ? <p className="m-0 mt-2 text-xs text-[#d64545]">{searchError}</p> : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {searchSongs.map(song => {
                const alreadyAdded = playlist.some(item => item.id === song.id)

                return (
                  <div key={song.id} className="flex items-center gap-3 border-b border-[#edf0f2] px-2 py-3">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden bg-[#eaf6ff] text-sm font-semibold text-[#1e88e5]"
                      style={
                        song.coverUrl
                          ? {
                              backgroundImage: `url(${song.coverUrl})`,
                              backgroundPosition: 'center',
                              backgroundSize: 'cover',
                            }
                          : undefined
                      }
                    >
                      {song.coverUrl ? null : song.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[#222a30]">{song.name}</span>
                      <span className="mt-1 block truncate text-xs text-[#71808a]">{song.artists}</span>
                    </span>
                    <button
                      type="button"
                      disabled={alreadyAdded || isMutating}
                      onClick={() => onAddSong(song)}
                      aria-label={`加入 ${song.name} 到房间歌单`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#1e88e5] hover:bg-[#eaf6ff] disabled:cursor-not-allowed disabled:text-[#c3cbd0]"
                    >
                      <PlusOutlined />
                    </button>
                  </div>
                )
              })}
              {!isSearching && searchSongs.length === 0 && !searchError ? (
                <p className="px-2 py-8 text-center text-sm text-[#71808a]">输入关键词并按回车搜索歌曲</p>
              ) : null}
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="border-b border-[#edf0f2] px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="m-0 text-sm font-semibold text-[#34454f]">房间歌单</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={playlist.length < 2 || isMutating}
                    onClick={onShuffle}
                    className="text-xs font-medium text-[#1e88e5] hover:text-[#1565c0] disabled:cursor-not-allowed disabled:text-[#aeb8be]"
                  >
                    随机排序
                  </button>
                  <Popconfirm
                    title="用喜欢列表覆盖房间歌单？"
                    description="当前房间歌单会被替换，正在播放的歌曲不会中断。"
                    okText="覆盖"
                    cancelText="取消"
                    onConfirm={onImportLiked}
                  >
                    <button
                      type="button"
                      disabled={isMutating}
                      className="text-xs font-medium text-[#1e88e5] hover:text-[#1565c0] disabled:cursor-not-allowed disabled:text-[#aeb8be]"
                    >
                      <ImportOutlined /> 导入喜欢
                    </button>
                  </Popconfirm>
                  <Popconfirm
                    title="清空房间歌单？"
                    description="正在播放的歌曲不会中断。"
                    okText="清空"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={onClear}
                  >
                    <button
                      type="button"
                      disabled={playlist.length === 0 || isMutating}
                      className="text-xs font-medium text-[#d64545] hover:text-[#b82f2f] disabled:cursor-not-allowed disabled:text-[#aeb8be]"
                    >
                      <ClearOutlined /> 清空
                    </button>
                  </Popconfirm>
                </div>
              </div>
              <p className="m-0 mt-1 text-xs text-[#71808a]">
                轮到你时自动播放队首歌曲并将其移至队尾。
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {playlist.length > 0 ? (
                <DragDropProvider
                  onDragEnd={event => {
                    if (event.canceled || isMutating) return
                    const source = event.operation.source
                    if (isSortable(source) && source.initialIndex !== source.index) {
                      onMoveSong(String(source.id), source.index)
                    }
                  }}
                >
                  {playlist.map((item, index) => (
                    <SortableRoomSong key={item.itemId} item={item} index={index} onRemove={onRemoveSong} />
                  ))}
                </DragDropProvider>
              ) : (
                <p className="px-2 py-8 text-center text-sm text-[#71808a]">
                  从左侧添加歌曲，或导入喜欢列表。
                </p>
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>
  )
}
