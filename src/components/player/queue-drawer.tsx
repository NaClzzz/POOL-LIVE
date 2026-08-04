import { DragOutlined } from '@ant-design/icons'
import { DragDropProvider } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { useEffect, useState } from 'react'

import type { PlayerSong } from '@/types/player'

type QueueDrawerProps = {
  open: boolean
  isLoading: boolean
  queue: PlayerSong[]
  currentIndex: number
  isLoadingAudio: boolean
  onClose: () => void
  onSelect: (index: number) => void
  onRemove: (index: number) => void
  onMove: (fromIndex: number, toIndex: number) => void
}

type SortableQueueItemProps = {
  song: PlayerSong
  index: number
  isCurrentSong: boolean
  isLoadingAudio: boolean
  onSelect: (index: number) => void
  onRemove: (index: number) => void
}

function SortableQueueItem({
  song,
  index,
  isCurrentSong,
  isLoadingAudio,
  onSelect,
  onRemove,
}: SortableQueueItemProps) {
  const { handleRef, isDragging, ref } = useSortable({ id: song.id, index })

  return (
    <div
      ref={ref}
      className={`grid grid-cols-[1fr_32px_32px] items-center gap-2 border-b border-[#edf0f2] py-3 ${
        isCurrentSong ? 'bg-[#eaf6ff]' : ''
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        disabled={isLoadingAudio}
        onClick={() => onSelect(index)}
        className="grid min-w-0 grid-cols-[24px_44px_1fr] items-center gap-3 px-2 text-left disabled:cursor-not-allowed"
      >
        <span className={`text-xs ${isCurrentSong ? 'text-[#1e88e5]' : 'text-[#9aa5ac]'}`}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span
          className="grid h-11 w-11 place-items-center overflow-hidden bg-[#dceffa] text-xs font-semibold text-[#1e88e5]"
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
          <span className={`block truncate text-sm font-medium ${isCurrentSong ? 'text-[#1e88e5]' : 'text-[#222a30]'}`}>
            {song.name}
          </span>
          <span className="mt-1 block truncate text-xs text-[#71808a]">{song.artists}</span>
        </span>
      </button>
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
        aria-label={`从播放列表移除 ${song.name}`}
        title={isCurrentSong ? '正在播放的歌曲不能在这里移除' : '移出列表'}
        disabled={isCurrentSong}
        onClick={() => onRemove(index)}
        className="grid h-8 w-8 place-items-center rounded-full text-lg text-[#9aa5ac] hover:bg-[#fff1f0] hover:text-[#d64545] disabled:cursor-not-allowed disabled:opacity-30"
      >
        ×
      </button>
    </div>
  )
}

export function QueueDrawer({
  open,
  isLoading,
  queue,
  currentIndex,
  isLoadingAudio,
  onClose,
  onSelect,
  onRemove,
  onMove,
}: QueueDrawerProps) {
  const [shouldRender, setShouldRender] = useState(open)
  const [isVisible, setIsVisible] = useState(open)

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
        aria-label="关闭播放列表"
        className={`absolute inset-0 bg-[#222a30]/20 transition-opacity duration-[260ms] ease-in-out ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="queue-drawer-title"
        className={`absolute bottom-0 right-0 top-0 flex w-[420px] flex-col border-l border-[#dfe4e7] bg-white transition-transform duration-[260ms] ease-in-out ${
          isVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#dfe4e7] px-6">
          <div>
            <p className="m-0 text-xs font-semibold tracking-[0.16em] text-[#1e88e5]">PLAY QUEUE</p>
            <h2 id="queue-drawer-title" className="m-0 mt-1 text-lg font-semibold text-[#222a30]">
              播放列表{isLoading ? '（加载中）' : `（${queue.length} 首）`}
            </h2>
          </div>
          <button
            type="button"
            aria-label="关闭播放列表"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-xl leading-none text-[#71808a] hover:bg-[#f0f7fc] hover:text-[#222a30]"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="grid grid-cols-[24px_44px_1fr] items-center gap-3 py-2">
                  <span className="h-3 w-4 bg-[#eef1f3]" />
                  <span className="h-11 w-11 bg-[#eef1f3]" />
                  <span className="block space-y-2">
                    <span className="block h-3 w-2/3 bg-[#eef1f3]" />
                    <span className="block h-2.5 w-1/3 bg-[#f3f5f6]" />
                  </span>
                </div>
              ))}
            </div>
          ) : queue.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-[#71808a]">
              播放列表还是空的
            </div>
          ) : (
            <DragDropProvider
              onDragEnd={event => {
                if (event.canceled) return

                const source = event.operation.source

                if (isSortable(source) && source.initialIndex !== source.index) {
                  onMove(source.initialIndex, source.index)
                }
              }}
            >
              {queue.map((song, index) => (
                <SortableQueueItem
                  key={song.id}
                  song={song}
                  index={index}
                  isCurrentSong={index === currentIndex}
                  isLoadingAudio={isLoadingAudio}
                  onSelect={onSelect}
                  onRemove={onRemove}
                />
              ))}
            </DragDropProvider>
          )}
        </div>
      </aside>
    </div>
  )
}
