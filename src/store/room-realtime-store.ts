'use client'

import { create } from 'zustand'

import type {
  RoomPlaybackState,
  RoomRealtimeChatMessage,
  RoomSocketSnapshot,
  UserRoomPlaylistItem,
} from '@/types/room'

// 房间客户端常驻的最大聊天消息数量，避免长期在线时列表无限增长。
const ROOM_MESSAGE_LIMIT = 200

// 用于让房间页面、底部播放器和右侧抽屉共享一份服务端房间状态。
type RoomRealtimeStore = {
  roomCode: string | null
  snapshot: RoomSocketSnapshot | null
  messages: RoomRealtimeChatMessage[]
  myPlaylist: UserRoomPlaylistItem[]
  playback: RoomPlaybackState | null
  connectionState: 'idle' | 'connecting' | 'joined' | 'error'
  error: string | null
  setJoinedRoom: (
    roomCode: string,
    snapshot: RoomSocketSnapshot,
    messages: RoomRealtimeChatMessage[],
    myPlaylist: UserRoomPlaylistItem[],
    playback: RoomPlaybackState,
  ) => void
  setPresence: (roomCode: string, snapshot: RoomSocketSnapshot) => void
  appendMessage: (roomCode: string, message: RoomRealtimeChatMessage) => void
  setPlaylist: (playlist: UserRoomPlaylistItem[]) => void
  setPlayback: (roomCode: string, playback: RoomPlaybackState) => void
  setConnectionState: (connectionState: RoomRealtimeStore['connectionState'], error?: string | null) => void
  clearRoom: (roomCode?: string) => void
}

export const useRoomRealtimeStore = create<RoomRealtimeStore>()(set => ({
  roomCode: null,
  snapshot: null,
  messages: [],
  myPlaylist: [],
  playback: null,
  connectionState: 'idle',
  error: null,

  setJoinedRoom: (roomCode, snapshot, messages, myPlaylist, playback) => {
    set({
      roomCode,
      snapshot,
      messages,
      myPlaylist,
      playback,
      connectionState: 'joined',
      error: null,
    })
  },

  setPresence: (roomCode, snapshot) => {
    set(state => (state.roomCode === roomCode ? { snapshot } : state))
  },

  appendMessage: (roomCode, message) => {
    set(state => {
      if (state.roomCode !== roomCode || state.messages.some(item => item.id === message.id)) {
        return state
      }

      return { messages: [...state.messages, message].slice(-ROOM_MESSAGE_LIMIT) }
    })
  },

  setPlaylist: myPlaylist => set({ myPlaylist }),

  setPlayback: (roomCode, playback) => {
    set(state => {
      if (state.roomCode !== roomCode) return state
      if (state.playback && playback.version < state.playback.version) return state
      return { playback }
    })
  },

  setConnectionState: (connectionState, error = null) => set({ connectionState, error }),

  clearRoom: roomCode => {
    set(state => {
      if (roomCode && state.roomCode !== roomCode) return state

      return {
        roomCode: null,
        snapshot: null,
        messages: [],
        myPlaylist: [],
        playback: null,
        connectionState: 'idle',
        error: null,
      }
    })
  },
}))
