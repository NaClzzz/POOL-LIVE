import type { PlayerSong } from '@/types/player'

export type RoomDraft = {
  code: string
  name: string
  tag: string
  isPasswordProtected: boolean
  maxMembers: number
  maxStageMembers: number
}

export type RoomCardData = {
  room: RoomDraft
  memberCount: number
  stageCount: number
  currentHostName: string
  currentSong: PlayerSong
}

export type StageMember = {
  id: string
  name: string
  avatarColor: string
  playlist: PlayerSong[]
  isCurrentUser?: boolean
}

export type RoomPlayerState = {
  activeStageIndex: number
  currentSongIndex: number
  activeSong: PlayerSong | null
  progressSeconds: number
}

export type RoomChatMessage = {
  id: string
  senderName: string
  content: string
  sentAt: string
  isMine?: boolean
}

export type RoomDemoData = {
  room: RoomDraft
  stageMembers: StageMember[]
  currentUser: StageMember
  isCurrentUserHost: boolean
  myPlaylist: PlayerSong[]
  player: RoomPlayerState
  chatMessages: RoomChatMessage[]
}
