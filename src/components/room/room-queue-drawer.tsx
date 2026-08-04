'use client'

import { CloseOutlined, DragOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { Input } from 'antd'
import { useEffect, useMemo, useState } from 'react'

import type { PlayerSong } from '@/types/player'

type RoomQueueDrawerProps = {
  open: boolean
  myPlaylist: PlayerSong[]
  searchSongs: PlayerSong[]
  isInitializing: boolean
  initializationError: string
  onClose: () => void
  onAddSong: (song: PlayerSong) => void
  onRemoveSong: (songId: number) => void
  onMoveSong: (fromIndex: number, toIndex: number) => void
  onShuffle: () => void
}

type SortableRoomSongProps = {
  song: PlayerSong
  index: number
  onRemove: (songId: number) => void
}

function formatDuration(duration: number) {
  const totalSeconds = Math.floor(duration / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${minutes}:${seconds}`
}

function SortableRoomSong({ song, index, onRemove }: SortableRoomSongProps) {
  const { handleRef, isDragging, ref } = useSortable({ id: song.id, index })

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
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-[#222a30]">{song.name}</span>
        <span className="mt-1 block truncate text-xs text-[#71808a]">
          {song.artists} · {formatDuration(song.duration)}
        </span>
      </span>
      <button
        ref={handleRef}
        type="button"
        aria-label={`拖拽排序 ${song.name}`}
        title="拖拽排序"
        onClick={event => event.stopPropagation()}
        className="grid h-8 w-8 place-items-center rounded-full text-[#9aa5ac] hover:bg-[#eaf6ff] hover:text-[#1e88e5]"
      >
        <DragOutlined />
      </button>
      <button
        type="button"
        onClick={() => onRemove(song.id)}
        aria-label={`从我的播放列表移除 ${song.name}`}
        className="grid h-8 w-8 place-items-center rounded-full text-lg text-[#9aa5ac] hover:bg-[#fff1f0] hover:text-[#d64545]"
      >
        ×
      </button>
    </div>
  )
}

export function RoomQueueDrawer({
  open,
  myPlaylist,
  searchSongs,
  isInitializing,
  initializationError,
  onClose,
  onAddSong,
  onRemoveSong,
  onMoveSong,
  onShuffle,
}: RoomQueueDrawerProps) {
  const [keywords, setKeywords] = useState('')
  const [shouldRender, setShouldRender] = useState(open)
  const [isVisible, setIsVisible] = useState(open)

  const filteredSongs = useMemo(() => {
    const normalizedKeywords = keywords.trim().toLowerCase()
    if (!normalizedKeywords) return searchSongs

    return searchSongs.filter(song =>
      `${song.name} ${song.artists} ${song.albumName}`.toLowerCase().includes(normalizedKeywords),
    )
  }, [keywords, searchSongs])

  useEffect(() => {
    let animationFrame: number | undefined
    let revealFrame: number | undefined
    let closeTimeout: number | undefined

    if (open) {
      animationFrame = window.requestAnimationFrame(() => {
        setShouldRender(true)
        revealFrame = window.requestAnimationFrame(() => setIsVisible(true))
      })
    } else {
      animationFrame = window.requestAnimationFrame(() => setIsVisible(false))
      closeTimeout = window.setTimeout(() => setShouldRender(false), 260)
    }

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      if (revealFrame) window.cancelAnimationFrame(revealFrame)
      if (closeTimeout) window.clearTimeout(closeTimeout)
    }
  }, [open])

  if (!shouldRender) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭我的播放列表"
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
            <p className="m-0 text-xs font-semibold tracking-[0.16em] text-[#1e88e5]">ROOM PLAYLIST</p>
            <h2 id="room-queue-drawer-title" className="m-0 mt-1 text-lg font-semibold text-[#222a30]">
              我的播放列表
            </h2>
          </div>
          <button
            type="button"
            aria-label="关闭我的播放列表"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-lg text-[#71808a] hover:bg-[#f0f7fc] hover:text-[#222a30]"
          >
            <CloseOutlined />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-[#dfe4e7]">
          <section className="flex min-h-0 flex-col">
            <div className="border-b border-[#edf0f2] px-5 py-4">
              <p className="m-0 text-sm font-semibold text-[#34454f]">房间内搜歌</p>
              <Input
                className="mt-3"
                prefix={<SearchOutlined className="text-[#9aa5ac]" />}
                placeholder="搜索歌名、歌手或专辑"
                value={keywords}
                onChange={event => setKeywords(event.target.value)}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {filteredSongs.map(song => {
                const alreadyAdded = myPlaylist.some(item => item.id === song.id)

                return (
                  <div key={song.id} className="flex items-center gap-3 border-b border-[#edf0f2] px-2 py-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center bg-[#eaf6ff] text-sm font-semibold text-[#1e88e5]">
                      {song.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[#222a30]">{song.name}</span>
                      <span className="mt-1 block truncate text-xs text-[#71808a]">{song.artists}</span>
                    </span>
                    <button
                      type="button"
                      disabled={alreadyAdded}
                      onClick={() => onAddSong(song)}
                      aria-label={`加入 ${song.name} 到我的播放列表`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#1e88e5] hover:bg-[#eaf6ff] disabled:cursor-not-allowed disabled:text-[#c3cbd0]"
                    >
                      <PlusOutlined />
                    </button>
                  </div>
                )
              })}
              {filteredSongs.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-[#71808a]">没有找到匹配的模拟歌曲</p>
              ) : null}
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="border-b border-[#edf0f2] px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="m-0 text-sm font-semibold text-[#34454f]">我的播放列表</p>
                <button
                  type="button"
                  disabled={myPlaylist.length < 2}
                  onClick={onShuffle}
                  className="text-xs font-medium text-[#1e88e5] hover:text-[#1565c0] disabled:cursor-not-allowed disabled:text-[#aeb8be]"
                >
                  随机排序
                </button>
              </div>
              <p className="m-0 mt-1 text-xs text-[#71808a]">
                新搜到的歌曲会置顶；轮到你时，队首歌曲会播完后移至队尾。
              </p>
              {isInitializing ? (
                <p className="m-0 mt-2 text-xs text-[#71808a]">正在用最新喜欢列表初始化…</p>
              ) : null}
              {initializationError ? (
                <p className="m-0 mt-2 text-xs text-[#d64545]">
                  初始化失败，已保留演示列表：{initializationError}
                </p>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {myPlaylist.length > 0 ? (
                <DragDropProvider
                  onDragEnd={event => {
                    if (event.canceled) return

                    const source = event.operation.source

                    if (isSortable(source) && source.initialIndex !== source.index) {
                      onMoveSong(source.initialIndex, source.index)
                    }
                  }}
                >
                  {myPlaylist.map((song, index) => (
                    <SortableRoomSong
                      key={song.id}
                      song={song}
                      index={index}
                      onRemove={onRemoveSong}
                    />
                  ))}
                </DragDropProvider>
              ) : (
                <p className="px-2 py-8 text-center text-sm text-[#71808a]">
                  从左侧添加歌曲到你的播放列表
                </p>
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>
  )
}
