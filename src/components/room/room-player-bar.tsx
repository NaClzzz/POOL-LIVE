'use client'

import { MessageOutlined, SoundOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Avatar, Layout, Slider, Typography } from 'antd'
import { useEffect, useState } from 'react'

import { RoomChatDrawer } from '@/components/room/room-chat-drawer'
import { RoomQueueDrawer } from '@/components/room/room-queue-drawer'
import { mockSearchSongs } from '@/lib/room/demo-data'
import { useRoomDemoStore } from '@/store/room-demo-store'
import { usePlayerStore } from '@/store/player-store'
import type { LikedSong } from '@/types/liked-song'

type LikesResponse = {
  songs?: LikedSong[]
  message?: string
}

function formatTime(time: number) {
  if (!Number.isFinite(time) || time < 0) return '00:00'

  const totalSeconds = Math.floor(time)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${String(minutes).padStart(2, '0')}:${seconds}`
}

export function RoomPlayerBar() {
  const [activePanel, setActivePanel] = useState<'playlist' | 'chat' | null>(null)
  const [isInitializingPlaylist, setIsInitializingPlaylist] = useState(false)
  const [playlistInitializationError, setPlaylistInitializationError] = useState('')
  const roomCode = useRoomDemoStore(state => state.roomCode)
  const stageMembers = useRoomDemoStore(state => state.stageMembers)
  const myPlaylist = useRoomDemoStore(state => state.myPlaylist)
  const player = useRoomDemoStore(state => state.player)
  const chatMessages = useRoomDemoStore(state => state.chatMessages)
  const addSongToMyPlaylist = useRoomDemoStore(state => state.addSongToMyPlaylist)
  const removeSongFromMyPlaylist = useRoomDemoStore(state => state.removeSongFromMyPlaylist)
  const replaceMyPlaylist = useRoomDemoStore(state => state.replaceMyPlaylist)
  const moveMyPlaylist = useRoomDemoStore(state => state.moveMyPlaylist)
  const shuffleMyPlaylist = useRoomDemoStore(state => state.shuffleMyPlaylist)
  const sendChatMessage = useRoomDemoStore(state => state.sendChatMessage)
  const volume = usePlayerStore(state => state.volume)
  const setVolume = usePlayerStore(state => state.setVolume)

  const activeMember = stageMembers[player.activeStageIndex] ?? stageMembers[0]
  const currentSong = player.activeSong
  const totalDuration = currentSong ? currentSong.duration / 1000 : 0

  useEffect(() => {
    const controller = new AbortController()
    let isCurrent = true

    async function initializeMyPlaylistFromLikes() {
      setIsInitializingPlaylist(true)
      setPlaylistInitializationError('')

      try {
        const response = await fetch('/api/likes', { signal: controller.signal })
        const data = (await response.json()) as LikesResponse

        if (!response.ok) {
          throw new Error(data.message || '读取喜欢列表失败，请稍后再试')
        }

        if (!isCurrent) return

        // A successful empty response is meaningful: the room list should stay empty.
        replaceMyPlaylist(
          (data.songs ?? []).map(song => ({
            id: song.song_id,
            name: song.name,
            artists: song.artists,
            albumName: song.album_name,
            coverUrl: song.cover_url ?? undefined,
            duration: song.duration_ms,
          })),
        )
      } catch (error) {
        if (controller.signal.aborted || !isCurrent) return

        // Keep the room's demo list intact when initialization cannot load likes.
        setPlaylistInitializationError(
          error instanceof Error ? error.message : '读取喜欢列表失败，请稍后再试',
        )
      } finally {
        if (isCurrent) setIsInitializingPlaylist(false)
      }
    }

    void initializeMyPlaylistFromLikes()

    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [replaceMyPlaylist, roomCode])

  function handleVolumeChange(value: number | number[]) {
    const nextVolume = Array.isArray(value) ? value[0] : value

    if (typeof nextVolume === 'number') setVolume(nextVolume / 100)
  }

  return (
    <>
      <RoomQueueDrawer
        open={activePanel === 'playlist'}
        myPlaylist={myPlaylist}
        searchSongs={mockSearchSongs}
        onClose={() => setActivePanel(null)}
        onAddSong={addSongToMyPlaylist}
        onRemoveSong={removeSongFromMyPlaylist}
        onMoveSong={moveMyPlaylist}
        onShuffle={shuffleMyPlaylist}
        isInitializing={isInitializingPlaylist}
        initializationError={playlistInitializationError}
      />
      <RoomChatDrawer
        open={activePanel === 'chat'}
        messages={chatMessages}
        onClose={() => setActivePanel(null)}
        onSend={sendChatMessage}
      />
      <Layout.Footer className="!fixed !bottom-0 !left-0 !right-0 !z-30 !flex !min-h-24 !items-center !gap-4 !border-t !border-[#dfe4e7] !bg-white !px-12 !py-3">
        <div className="flex min-w-0 items-center gap-3 lg:max-w-xs">
          <Avatar shape="square" size={56} className="!shrink-0 !bg-[#42a5f5]">
            {currentSong?.name.slice(0, 1) ?? '♪'}
          </Avatar>
          <div className="min-w-0 flex-1">
            <Typography.Text className="!block !truncate !font-medium">
              {currentSong?.name ?? '等待上台成员添加歌曲'}
            </Typography.Text>
            <Typography.Text type="secondary" className="!block !truncate !text-xs">
              {activeMember ? `${activeMember.name} 的播放列表 · ${currentSong?.artists ?? ''}` : '房间同步中'}
            </Typography.Text>
          </div>
        </div>

        <div className="absolute left-1/2 top-1/2 hidden w-[min(560px,46vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-1 md:flex">
          <div className="flex w-full items-center gap-3">
            <Typography.Text type="secondary" className="!text-xs">
              {formatTime(player.progressSeconds)}
            </Typography.Text>
            <Slider
              className="!mb-0 flex-1"
              disabled
              min={0}
              max={totalDuration || 1}
              value={Math.min(player.progressSeconds, totalDuration || 0)}
              tooltip={{ open: false }}
            />
            <Typography.Text type="secondary" className="!text-xs">
              {formatTime(totalDuration)}
            </Typography.Text>
          </div>
          <Typography.Text type="secondary" className="!text-center !text-[11px]">
            房间播放状态将在接入 Socket 后同步
          </Typography.Text>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <SoundOutlined className="text-[#52616a]" />
          <Slider
            className="!mb-0 !w-20"
            min={0}
            max={100}
            value={volume * 100}
            tooltip={{ open: false }}
            onChange={handleVolumeChange}
          />
          <button
            type="button"
            aria-label="打开我的房间播放列表"
            onClick={() => setActivePanel('playlist')}
            className="grid h-8 w-8 place-items-center rounded-full text-lg text-[#52616a] hover:bg-[#eaf6ff] hover:text-[#1e88e5]"
          >
            <UnorderedListOutlined />
          </button>
          <button
            type="button"
            aria-label="打开房间聊天"
            onClick={() => setActivePanel('chat')}
            className="grid h-8 w-8 place-items-center rounded-full text-lg text-[#52616a] hover:bg-[#eaf6ff] hover:text-[#1e88e5]"
          >
            <MessageOutlined />
          </button>
        </div>
      </Layout.Footer>
    </>
  )
}
