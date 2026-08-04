'use client'

import { create } from 'zustand'

import { getRoomDemo } from '@/lib/room/demo-data'
import type { PlayerSong } from '@/types/player'
import type { RoomChatMessage, RoomDraft, RoomPlayerState, StageMember } from '@/types/room'

function getFirstSong(member: StageMember | undefined) {
  const song = member?.playlist[0]

  return song ? { ...song } : null
}

function cloneSongs(songs: PlayerSong[]) {
  return songs.map(song => ({ ...song }))
}

function moveSong(songs: PlayerSong[], fromIndex: number, toIndex: number) {
  const nextSongs = [...songs]
  const [song] = nextSongs.splice(fromIndex, 1)

  if (!song) return songs

  nextSongs.splice(toIndex, 0, song)
  return nextSongs
}

function shuffleSongs(songs: PlayerSong[]) {
  const shuffledSongs = [...songs]

  for (let index = shuffledSongs.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffledSongs[index], shuffledSongs[swapIndex]] = [
      shuffledSongs[swapIndex],
      shuffledSongs[index],
    ]
  }

  return shuffledSongs
}

function replaceCurrentUserPlaylist(
  state: Pick<RoomDemoStore, 'currentUser' | 'stageMembers'>,
  playlist: PlayerSong[],
) {
  const nextPlaylist = cloneSongs(playlist)

  return {
    currentUser: {
      ...state.currentUser,
      playlist: cloneSongs(nextPlaylist),
    },
    stageMembers: state.stageMembers.map(member =>
      member.id === state.currentUser.id
        ? { ...member, playlist: cloneSongs(nextPlaylist) }
        : member,
    ),
  }
}

type RoomDemoStore = {
  roomCode: string
  room: RoomDraft
  stageMembers: StageMember[]
  currentUser: StageMember
  isCurrentUserHost: boolean
  myPlaylist: PlayerSong[]
  player: RoomPlayerState
  chatMessages: RoomChatMessage[]
  hasJoinedStage: boolean
  initializeRoom: (roomCode: string) => void
  joinStage: () => void
  leaveStage: (memberId: string) => void
  addSongToMyPlaylist: (song: PlayerSong) => void
  removeSongFromMyPlaylist: (songId: number) => void
  replaceMyPlaylist: (songs: PlayerSong[]) => void
  moveMyPlaylist: (fromIndex: number, toIndex: number) => void
  shuffleMyPlaylist: () => void
  advanceRoomPlayback: (memberId?: string) => void
  sendChatMessage: (content: string) => void
}

const initialRoom = getRoomDemo('pool-demo-room')

export const useRoomDemoStore = create<RoomDemoStore>()((set, get) => ({
  roomCode: initialRoom.room.code,
  room: initialRoom.room,
  stageMembers: initialRoom.stageMembers,
  currentUser: initialRoom.currentUser,
  isCurrentUserHost: initialRoom.isCurrentUserHost,
  myPlaylist: initialRoom.myPlaylist,
  player: initialRoom.player,
  chatMessages: initialRoom.chatMessages,
  hasJoinedStage: false,

  initializeRoom: roomCode => {
    const nextRoom = getRoomDemo(roomCode)

    set({
      roomCode: nextRoom.room.code,
      room: nextRoom.room,
      stageMembers: nextRoom.stageMembers,
      currentUser: nextRoom.currentUser,
      isCurrentUserHost: nextRoom.isCurrentUserHost,
      myPlaylist: nextRoom.myPlaylist,
      player: nextRoom.player,
      chatMessages: nextRoom.chatMessages,
      hasJoinedStage: false,
    })
  },

  joinStage: () => {
    const state = get()
    if (state.hasJoinedStage) return

    set({
      hasJoinedStage: true,
      stageMembers: [
        ...state.stageMembers,
        {
          ...state.currentUser,
          playlist: state.myPlaylist.map(song => ({ ...song })),
        },
      ],
    })
  },

  leaveStage: memberId => {
    const state = get()
    const removedIndex = state.stageMembers.findIndex(member => member.id === memberId)
    if (removedIndex < 0) return

    const nextStageMembers = state.stageMembers.filter(member => member.id !== memberId)
    const { activeStageIndex } = state.player
    let nextActiveStageIndex = activeStageIndex

    if (nextStageMembers.length === 0) {
      nextActiveStageIndex = 0
    } else if (removedIndex < activeStageIndex) {
      nextActiveStageIndex = activeStageIndex - 1
    } else if (removedIndex === activeStageIndex) {
      nextActiveStageIndex = activeStageIndex % nextStageMembers.length
    }

    set({
      stageMembers: nextStageMembers,
      hasJoinedStage: memberId === state.currentUser.id ? false : state.hasJoinedStage,
      player: {
        ...state.player,
        activeStageIndex: nextActiveStageIndex,
        currentSongIndex: removedIndex === activeStageIndex ? 0 : state.player.currentSongIndex,
        activeSong:
          removedIndex === activeStageIndex
            ? getFirstSong(nextStageMembers[nextActiveStageIndex])
            : state.player.activeSong,
        progressSeconds: removedIndex === activeStageIndex ? 0 : state.player.progressSeconds,
      },
    })
  },

  addSongToMyPlaylist: song => {
    const state = get()
    if (state.myPlaylist.some(item => item.id === song.id)) return

    const nextPlaylist = [{ ...song }, ...state.myPlaylist]
    const syncedState = replaceCurrentUserPlaylist(state, nextPlaylist)

    set({
      myPlaylist: nextPlaylist,
      ...syncedState,
    })
  },

  removeSongFromMyPlaylist: songId => {
    const state = get()
    const nextPlaylist = state.myPlaylist.filter(song => song.id !== songId)
    const syncedState = replaceCurrentUserPlaylist(state, nextPlaylist)

    set({
      myPlaylist: nextPlaylist,
      ...syncedState,
    })
  },

  replaceMyPlaylist: songs => {
    const state = get()
    const nextPlaylist = cloneSongs(songs)
    const syncedState = replaceCurrentUserPlaylist(state, nextPlaylist)

    set({
      myPlaylist: nextPlaylist,
      ...syncedState,
    })
  },

  moveMyPlaylist: (fromIndex, toIndex) => {
    const state = get()

    if (
      fromIndex < 0 ||
      fromIndex >= state.myPlaylist.length ||
      toIndex < 0 ||
      toIndex >= state.myPlaylist.length ||
      fromIndex === toIndex
    ) {
      return
    }

    const nextPlaylist = moveSong(state.myPlaylist, fromIndex, toIndex)
    const syncedState = replaceCurrentUserPlaylist(state, nextPlaylist)

    set({ myPlaylist: nextPlaylist, ...syncedState })
  },

  shuffleMyPlaylist: () => {
    const state = get()
    const nextPlaylist = shuffleSongs(state.myPlaylist)
    const syncedState = replaceCurrentUserPlaylist(state, nextPlaylist)

    set({ myPlaylist: nextPlaylist, ...syncedState })
  },

  advanceRoomPlayback: memberId => {
    const state = get()
    const memberIndex = memberId
      ? state.stageMembers.findIndex(member => member.id === memberId)
      : state.player.activeStageIndex

    if (memberIndex < 0 || memberIndex >= state.stageMembers.length) return

    const member = state.stageMembers[memberIndex]
    const [activeSong, ...remainingSongs] = member.playlist
    const rotatedPlaylist = activeSong ? [...remainingSongs, activeSong] : []
    const nextStageMembers = state.stageMembers.map((stageMember, index) =>
      index === memberIndex
        ? { ...stageMember, playlist: cloneSongs(rotatedPlaylist) }
        : stageMember,
    )
    const isCurrentUserTurn = member.id === state.currentUser.id

    set({
      stageMembers: nextStageMembers,
      currentUser: isCurrentUserTurn
        ? { ...state.currentUser, playlist: cloneSongs(rotatedPlaylist) }
        : state.currentUser,
      myPlaylist: isCurrentUserTurn ? cloneSongs(rotatedPlaylist) : state.myPlaylist,
      player: {
        ...state.player,
        activeStageIndex: memberIndex,
        currentSongIndex: 0,
        activeSong: activeSong ? { ...activeSong } : null,
        progressSeconds: 0,
      },
    })
  },

  sendChatMessage: content => {
    const trimmedContent = content.trim()
    if (!trimmedContent) return

    const message: RoomChatMessage = {
      id: `local-message-${Date.now()}`,
      senderName: '我',
      content: trimmedContent,
      sentAt: '刚刚',
      isMine: true,
    }

    set(state => ({ chatMessages: [...state.chatMessages, message] }))
  },
}))
