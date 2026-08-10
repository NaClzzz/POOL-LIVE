import type { PlayerSong } from '@/types/player'

// 用于大厅创建房间表单和路由参数中的房间配置。
export type RoomDraft = {
  code: string
  name: string
  tag: string
  isPasswordProtected: boolean
  maxMembers: number
  maxStageMembers: number
}

// 用于大厅展示公开房间摘要。
export type RoomListItem = {
  code: string
  name: string
  tag: string
  isPasswordProtected: boolean
  maxMembers: number
  maxStageMembers: number
  memberCount: number
  ownerName: string
  lastActiveAt: string
}

// 用于 Socket 在线成员快照中的单个成员信息。
export type RoomPresenceMember = {
  id: string
  name: string
  joinedAt: string
  isOwner?: boolean
}

// 用于加入房间和在线成员变化时传输房间基础状态及固定上台顺序。
export type RoomSocketSnapshot = {
  room: {
    code: string
    name: string
    tag: string
    isPasswordProtected: boolean
    maxMembers: number
    maxStageMembers: number
    memberCount: number
  }
  members: RoomPresenceMember[]
  stageMembers: RoomPresenceMember[]
}

// 用于房主修改房间基础配置时提交的 Socket 事件数据。
export type RoomSettingsPayload = {
  name: string
  tag: string
  maxMembers: number
  maxStageMembers: number
  passwordAction: 'keep' | 'set' | 'remove'
  password?: string
}

// 用于房主修改房间配置后接收成功快照或可展示的失败原因。
export type RoomSettingsAcknowledgement =
  | {
      ok: true
      snapshot: RoomSocketSnapshot
    }
  | {
      ok: false
      message: string
    }

// 用于房主解散房间事件的确认结果，让发起页面能够展示失败原因。
export type RoomDissolveAcknowledgement =
  | { ok: true }
  | {
      ok: false
      message: string
    }

// 用于通知房间内所有标签页当前房间已被房主解散。
export type RoomDissolvedPayload = {
  roomCode: string
}

// 用于真实 Socket 聊天历史和实时广播的持久化消息数据。
export type RoomRealtimeChatMessage = {
  id: string
  senderId: string
  senderName: string
  content: string
  createdAt: string
}

// 用于用户在所有房间共用的独立上台歌单项。
export type UserRoomPlaylistItem = PlayerSong & {
  itemId: string
  position: number
}

// 用于服务端驱动房间节目和客户端计算播放进度。
export type RoomPlaybackState = {
  status: 'idle' | 'playing'
  version: number
  activeStageIndex: number
  activeMemberId: string | null
  currentItemId: string | null
  song: PlayerSong | null
  startedAt: string | null
  startOffsetMs: number
  durationMs: number
  // 用于展示当前节目的全体其他在线成员投票进度；播放者本人不能投票。
  skipVoteCount: number
  skipVoteRequired: number
  skipVoterIds: string[]
}

// 用于 room:join 成功确认，同时返回房间、聊天、歌单和当前节目状态。
export type RoomJoinResult = {
  snapshot: RoomSocketSnapshot
  messages: RoomRealtimeChatMessage[]
  myPlaylist: UserRoomPlaylistItem[]
  playback: RoomPlaybackState
}

// 用于通知客户端当前用户已经在另一个房间，需要确认切换。
export type RoomSwitchRequired = {
  code: 'ALREADY_IN_ROOM'
  currentRoomCode: string
}
