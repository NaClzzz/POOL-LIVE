import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { randomBytes } from 'node:crypto'

import { likedSongs, user } from '../src/db/schema/legacy'
import {
  roomMembers,
  roomMessages,
  roomPlaybackStates,
  rooms,
  userRoomPlaylistItems,
} from '../src/db/schema/rooms'
import { database } from '../src/lib/database-core'
import {
  hashRoomPassword,
  ROOM_PASSWORD_MAX_LENGTH,
  ROOM_PASSWORD_MIN_LENGTH,
  verifyRoomPassword,
} from '../src/lib/room/password'
import type {
  RoomJoinResult,
  RoomPlaybackState,
  RoomPresenceMember,
  RoomRealtimeChatMessage,
  RoomSettingsPayload,
  RoomSocketSnapshot,
  UserRoomPlaylistItem,
} from '../src/types/room'

const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000
const RECENT_MESSAGE_LIMIT = 50

// 用于校验并规范客户端提交的歌曲元数据，避免把任意对象写入数据库。
function normalizePlaylistSong(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RoomPlaylistError('歌曲数据格式不正确。')
  }

  const input = value as Record<string, unknown>
  const id = Number(input.id)
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const artists = typeof input.artists === 'string' ? input.artists.trim() : ''
  const albumName = typeof input.albumName === 'string' ? input.albumName.trim() : ''
  const coverUrl = typeof input.coverUrl === 'string' ? input.coverUrl.trim() : ''
  const duration = Number(input.duration)

  if (!Number.isSafeInteger(id) || id <= 0) throw new RoomPlaylistError('歌曲 ID 不正确。')
  if (!name || name.length > 160 || !artists || artists.length > 240 || !albumName || albumName.length > 160) {
    throw new RoomPlaylistError('歌曲信息长度不正确。')
  }
  if (coverUrl.length > 2000) throw new RoomPlaylistError('歌曲封面地址过长。')

  return {
    id,
    name,
    artists,
    albumName,
    coverUrl: coverUrl || undefined,
    duration: Number.isFinite(duration) && duration >= 0 ? Math.floor(duration) : 0,
  }
}

function normalizeItemId(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 100) {
    throw new RoomPlaylistError('歌单项 ID 不正确。')
  }

  return value.trim()
}

function normalizePlaylistIndex(value: unknown) {
  if (!Number.isInteger(value)) throw new RoomPlaylistError('播放列表位置不正确。')
  return value as number
}

function normalizePlaybackErrorPayload(value: unknown): PlaybackErrorPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RoomPlaybackError('播放错误数据格式不正确。')
  }

  const input = value as Record<string, unknown>
  if (!Number.isInteger(input.version) || typeof input.itemId !== 'string') {
    throw new RoomPlaybackError('播放错误数据格式不正确。')
  }

  return { version: input.version as number, itemId: input.itemId.trim() }
}

function shuffleInPlace<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[items[index], items[swapIndex]] = [items[swapIndex], items[index]]
  }

  return items
}

// 用于 Socket 服务内部保存已通过 Better Auth 验证的用户身份。
type AuthenticatedUser = {
  id: string
  name: string
  email: string
}

// 用于单进程内记录一个用户在同一房间打开的全部 Socket 标签页。
type OnlineMember = {
  id: string
  name: string
  joinedAt: Date
  socketIds: Set<string>
}

// 用于标记 Drizzle 查询出的 rooms 表单行类型。
type RoomRow = typeof rooms.$inferSelect

export class RoomJoinError extends Error {
  constructor(message: string, readonly code?: 'ALREADY_IN_ROOM', readonly currentRoomCode?: string) {
    super(message)
  }
}

export class RoomChatError extends Error {}

export class RoomStageError extends Error {}

export class RoomPlaylistError extends Error {}

export class RoomPlaybackError extends Error {}

// 用于区分房主配置校验失败与其他 Socket 房间业务错误。
export class RoomSettingsError extends Error {}

// 用于 Socket 播放错误事件中校验当前节目版本和歌曲。
type PlaybackErrorPayload = {
  version: number
  itemId: string
}

// 用于房间播放状态变化后通知 Socket 层广播。
type PlaybackChangedHandler = (roomCode: string, playback: RoomPlaybackState) => void

// 用于用户全局上台歌单变化后通知该用户的所有标签页。
type PlaylistChangedHandler = (userId: string, playlist: UserRoomPlaylistItem[]) => void

// 用于在单个节目版本内记录已投票跳过的在线用户；节目切换后立即清空。
type SkipVoteRecord = {
  version: number
  voterIds: Set<string>
}

// 用于保存经过服务端清理和范围校验后的房间配置。
type NormalizedRoomSettings = {
  name: string
  tag: string
  maxMembers: number
  maxStageMembers: number
  passwordAction: RoomSettingsPayload['passwordAction']
  password: string | null
}

export function normalizeRoomCode(value: unknown) {
  if (typeof value !== 'string') return null

  const roomCode = value.trim().toLowerCase()

  // 房间码只由服务端生成，例如 pool-a1b2c3d4。
  return /^pool-[a-f0-9]{8}$/.test(roomCode) ? roomCode : null
}

function normalizeChatContent(value: unknown) {
  if (typeof value !== 'string') {
    throw new RoomChatError('聊天内容格式不正确。')
  }

  const content = value.trim()

  if (content.length < 1 || content.length > 120) {
    throw new RoomChatError('消息应为 1 到 120 个字符。')
  }

  return content
}

function normalizeRoomSettingsPayload(value: unknown): NormalizedRoomSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RoomSettingsError('房间设置数据格式不正确。')
  }

  const input = value as Record<string, unknown>
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const tag = typeof input.tag === 'string' ? input.tag.trim() : ''
  const maxMembers = input.maxMembers
  const maxStageMembers = input.maxStageMembers
  const passwordAction = input.passwordAction

  if (name.length < 2 || name.length > 20) {
    throw new RoomSettingsError('房间名称长度应为 2 到 20 个字符。')
  }

  if (tag.length < 2 || tag.length > 12) {
    throw new RoomSettingsError('房间标签长度应为 2 到 12 个字符。')
  }

  if (!Number.isInteger(maxMembers) || (maxMembers as number) < 2 || (maxMembers as number) > 50) {
    throw new RoomSettingsError('最大人数应为 2 到 50 之间的整数。')
  }

  if (
    !Number.isInteger(maxStageMembers) ||
    (maxStageMembers as number) < 1 ||
    (maxStageMembers as number) > 30
  ) {
    throw new RoomSettingsError('最大上台人数应为 1 到 30 之间的整数。')
  }

  if ((maxStageMembers as number) > (maxMembers as number)) {
    throw new RoomSettingsError('最大上台人数不能超过最大人数。')
  }

  if (passwordAction !== 'keep' && passwordAction !== 'set' && passwordAction !== 'remove') {
    throw new RoomSettingsError('密码操作类型不正确。')
  }

  const password = input.password
  if (passwordAction === 'set') {
    if (typeof password !== 'string') {
      throw new RoomSettingsError('请设置房间密码。')
    }

    if (password.length < ROOM_PASSWORD_MIN_LENGTH || password.length > ROOM_PASSWORD_MAX_LENGTH) {
      throw new RoomSettingsError(
        `房间密码长度应为 ${ROOM_PASSWORD_MIN_LENGTH} 到 ${ROOM_PASSWORD_MAX_LENGTH} 个字符。`,
      )
    }

    return {
      name,
      tag,
      maxMembers: maxMembers as number,
      maxStageMembers: maxStageMembers as number,
      passwordAction,
      password,
    }
  }

  return {
    name,
    tag,
    maxMembers: maxMembers as number,
    maxStageMembers: maxStageMembers as number,
    passwordAction,
    password: null,
  }
}

// 负责单 Socket 进程中的在线成员、房间加入/离开和持久化聊天。
export class RoomPresenceService {
  private readonly db = drizzle({ client: database })
  private readonly onlineRooms = new Map<string, Map<string, OnlineMember>>()
  private readonly userRoomCodes = new Map<string, string>()
  private readonly stageQueues = new Map<string, string[]>()
  private readonly roomLocks = new Map<string, Promise<void>>()
  private readonly userLocks = new Map<string, Promise<void>>()
  private readonly playbackTimers = new Map<string, NodeJS.Timeout>()
  private readonly skipVotes = new Map<string, SkipVoteRecord>()
  private onPlaybackChanged: PlaybackChangedHandler | null = null
  private onPlaylistChanged: PlaylistChangedHandler | null = null

  setPlaybackChangedHandler(handler: PlaybackChangedHandler) {
    this.onPlaybackChanged = handler
  }

  setPlaylistChangedHandler(handler: PlaylistChangedHandler) {
    this.onPlaylistChanged = handler
  }

  async getActiveRoomCode(userId: string) {
    return this.userRoomCodes.get(userId) ?? (await this.findActiveRoomCode(userId))
  }

  async resetPersistedPresence() {
    const now = new Date()
    const nextEmptyExpiry = new Date(now.getTime() + EMPTY_ROOM_TTL_MS)

    this.stageQueues.clear()
    this.userRoomCodes.clear()
    this.skipVotes.clear()
    for (const timer of this.playbackTimers.values()) clearTimeout(timer)
    this.playbackTimers.clear()

    await this.db.transaction(async tx => {
      await tx.update(roomMembers).set({ leftAt: now }).where(isNull(roomMembers.leftAt))
      await tx
        .update(rooms)
        .set({
          currentMemberCount: 0,
          emptyExpiresAt: nextEmptyExpiry,
          lastActiveAt: now,
          updatedAt: now,
        })
        .where(gt(rooms.currentMemberCount, 0))

      await tx
        .update(roomPlaybackStates)
        .set({
          activeStageIndex: -1,
          activeMemberId: null,
          currentItemId: null,
          currentSongId: null,
          currentSongName: null,
          currentSongArtists: null,
          currentSongAlbumName: null,
          currentSongCoverUrl: null,
          currentSongDurationMs: null,
          status: 'idle',
          startedAt: null,
          startOffsetMs: 0,
          version: sql`${roomPlaybackStates.version} + 1`,
          updatedAt: now,
        })
    })
  }

  async joinRoom({
    roomCode,
    password,
    user: currentUser,
    socketId,
  }: {
    roomCode: string
    password: string | null
    user: AuthenticatedUser
    socketId: string
  }): Promise<RoomJoinResult> {
    return this.withUserLock(currentUser.id, () => this.withRoomLock(roomCode, async () => {
      const activeRoomCode = this.userRoomCodes.get(currentUser.id) ?? (await this.findActiveRoomCode(currentUser.id))

      if (activeRoomCode && activeRoomCode !== roomCode) {
        throw new RoomJoinError(
          `你已在房间 ${activeRoomCode} 中，请先确认切换房间。`,
          'ALREADY_IN_ROOM',
          activeRoomCode,
        )
      }

      const room = await this.findRoom(roomCode)
      const now = new Date()

      if (!room) {
        throw new RoomJoinError('房间不存在或已被清理。')
      }

      if (room.currentMemberCount === 0 && room.emptyExpiresAt <= now) {
        throw new RoomJoinError('房间已过期，请返回大厅选择其他房间。')
      }

      if (room.passwordHash) {
        if (!password) {
          throw new RoomJoinError('该房间需要密码。')
        }

        if (
          password.length < 6 ||
          password.length > 64 ||
          !(await verifyRoomPassword(password, room.passwordHash))
        ) {
          throw new RoomJoinError('房间密码不正确。')
        }
      }

      const onlineMembers = this.getOnlineRoom(roomCode)
      const existingMember = onlineMembers.get(currentUser.id)

      if (!existingMember && onlineMembers.size >= room.maxMembers) {
        throw new RoomJoinError('房间人数已满。')
      }

      const nextMemberCount = existingMember ? onlineMembers.size : onlineMembers.size + 1
      const nextEmptyExpiry = new Date(now.getTime() + EMPTY_ROOM_TTL_MS)

      await this.db.transaction(async tx => {
        if (!existingMember) {
          await tx
            .insert(roomMembers)
            .values({ roomId: room.id, userId: currentUser.id, joinedAt: now, leftAt: null })
            .onConflictDoUpdate({
              target: [roomMembers.roomId, roomMembers.userId],
              set: { joinedAt: now, leftAt: null },
            })
        }

        await tx
          .update(rooms)
          .set({
            currentMemberCount: nextMemberCount,
            lastActiveAt: now,
            emptyExpiresAt: nextEmptyExpiry,
            updatedAt: now,
          })
          .where(eq(rooms.id, room.id))
      })

      if (existingMember) {
        existingMember.socketIds.add(socketId)
      } else {
        onlineMembers.set(currentUser.id, {
          id: currentUser.id,
          name: currentUser.name,
          joinedAt: now,
          socketIds: new Set([socketId]),
        })
      }
      this.userRoomCodes.set(currentUser.id, roomCode)

      return {
        snapshot: this.toSnapshot(room, onlineMembers),
        messages: await this.getRecentMessages(room.id),
        myPlaylist: await this.getUserPlaylist(currentUser.id),
        playback: await this.getRoomPlayback(room),
      }
    }))
  }

  async leaveRoom({
    roomCode,
    userId,
    socketId,
  }: {
    roomCode: string
    userId: string
    socketId: string
  }): Promise<RoomSocketSnapshot | null> {
    return this.withUserLock(userId, () => this.withRoomLock(roomCode, async () => {
      const onlineMembers = this.onlineRooms.get(roomCode)
      const member = onlineMembers?.get(userId)

      // 显式离开和 disconnect 可能连续触发，第二次调用应当安全地什么也不做。
      if (!onlineMembers || !member || !member.socketIds.has(socketId)) return null

      member.socketIds.delete(socketId)
      if (member.socketIds.size > 0) {
        const room = await this.findRoom(roomCode)
        return room ? this.toSnapshot(room, onlineMembers) : null
      }

      onlineMembers.delete(userId)
      this.removeSkipVote(roomCode, userId)
      const removedStageIndex = this.removeStageMember(roomCode, userId)
      if (onlineMembers.size === 0) this.onlineRooms.delete(roomCode)
      this.userRoomCodes.delete(userId)

      const room = await this.findRoom(roomCode)
      if (!room) return null

      const now = new Date()
      const nextEmptyExpiry = new Date(now.getTime() + EMPTY_ROOM_TTL_MS)
      const nextOwner = this.getMembers(onlineMembers)[0]
      const nextOwnerId = room.ownerId === userId && nextOwner ? nextOwner.id : room.ownerId

      await this.db.transaction(async tx => {
        await tx
          .update(roomMembers)
          .set({ leftAt: now })
          .where(
            and(
              eq(roomMembers.roomId, room.id),
              eq(roomMembers.userId, userId),
              isNull(roomMembers.leftAt),
            ),
          )

        await tx
          .update(rooms)
          .set({
            ownerId: nextOwnerId,
            currentMemberCount: onlineMembers.size,
            lastActiveAt: now,
            emptyExpiresAt: nextEmptyExpiry,
            updatedAt: now,
          })
          .where(eq(rooms.id, room.id))
      })

      const nextRoom = { ...room, ownerId: nextOwnerId }
      if (removedStageIndex >= 0) {
        await this.advancePlaybackLocked(nextRoom, onlineMembers, removedStageIndex - 1)
      } else {
        this.onPlaybackChanged?.(roomCode, await this.getRoomPlayback(nextRoom))
      }

      return this.toSnapshot(nextRoom, onlineMembers)
    }))
  }

  async forceLeaveUser({
    roomCode,
    userId,
  }: {
    roomCode: string
    userId: string
  }): Promise<RoomSocketSnapshot | null> {
    return this.withUserLock(userId, () => this.withRoomLock(roomCode, async () => {
      const onlineMembers = this.onlineRooms.get(roomCode)
      const member = onlineMembers?.get(userId)
      const room = await this.findRoom(roomCode)

      if (!room) return null

      const removedStageIndex = this.removeStageMember(roomCode, userId)
      if (member) {
        onlineMembers?.delete(userId)
        this.removeSkipVote(roomCode, userId)
      }
      if (onlineMembers?.size === 0) this.onlineRooms.delete(roomCode)
      this.userRoomCodes.delete(userId)

      const currentMembers = onlineMembers ?? new Map<string, OnlineMember>()
      const nextOwner = this.getMembers(currentMembers)[0]
      const nextOwnerId = room.ownerId === userId && nextOwner ? nextOwner.id : room.ownerId
      const now = new Date()

      await this.db.transaction(async tx => {
        await tx
          .update(roomMembers)
          .set({ leftAt: now })
          .where(
            and(
              eq(roomMembers.roomId, room.id),
              eq(roomMembers.userId, userId),
              isNull(roomMembers.leftAt),
            ),
          )
        await tx
          .update(rooms)
          .set({
            ownerId: nextOwnerId,
            currentMemberCount: currentMembers.size,
            lastActiveAt: now,
            emptyExpiresAt: new Date(now.getTime() + EMPTY_ROOM_TTL_MS),
            updatedAt: now,
          })
          .where(eq(rooms.id, room.id))
      })

      const nextRoom = { ...room, ownerId: nextOwnerId }
      if (removedStageIndex >= 0) {
        await this.advancePlaybackLocked(nextRoom, currentMembers, removedStageIndex - 1)
      } else {
        this.onPlaybackChanged?.(roomCode, await this.getRoomPlayback(nextRoom))
      }

      return this.toSnapshot(nextRoom, currentMembers)
    }))
  }

  async sendMessage({
    roomCode,
    socketId,
    user: currentUser,
    content: rawContent,
  }: {
    roomCode: string
    socketId: string
    user: AuthenticatedUser
    content: unknown
  }): Promise<RoomRealtimeChatMessage> {
    const content = normalizeChatContent(rawContent)
    const onlineMember = this.onlineRooms.get(roomCode)?.get(currentUser.id)

    if (!onlineMember?.socketIds.has(socketId)) {
      throw new RoomChatError('请先加入房间后再发送消息。')
    }

    const room = await this.findRoom(roomCode)
    if (!room) {
      throw new RoomChatError('房间不存在或已被清理。')
    }

    const now = new Date()
    const [createdMessage] = await this.db.transaction(async tx => {
      const [message] = await tx
        .insert(roomMessages)
        .values({
          id: `message_${randomBytes(12).toString('base64url')}`,
          roomId: room.id,
          userId: currentUser.id,
          content,
        })
        .returning({
          id: roomMessages.id,
          content: roomMessages.content,
          createdAt: roomMessages.createdAt,
        })

      if (!message) throw new Error('消息写入后未返回结果。')

      await tx
        .update(rooms)
        .set({
          lastActiveAt: now,
          updatedAt: now,
        })
        .where(eq(rooms.id, room.id))

      return [message]
    })

    if (!createdMessage) throw new Error('消息写入后未返回结果。')

    return {
      id: createdMessage.id,
      senderId: currentUser.id,
      senderName: currentUser.name,
      content: createdMessage.content,
      createdAt: createdMessage.createdAt.toISOString(),
    }
  }

  async joinStage({
    roomCode,
    userId,
    socketId,
  }: {
    roomCode: string
    userId: string
    socketId: string
  }): Promise<RoomSocketSnapshot> {
    return this.withRoomLock(roomCode, async () => {
      const onlineMembers = this.onlineRooms.get(roomCode)
      const onlineMember = onlineMembers?.get(userId)

      if (!onlineMembers || !onlineMember?.socketIds.has(socketId)) {
        throw new RoomStageError('请先加入房间后再上台。')
      }

      const room = await this.findRoom(roomCode)
      if (!room) {
        throw new RoomStageError('房间不存在或已被清理。')
      }

      const stageQueue = this.getStageQueue(roomCode)

      if (stageQueue.includes(userId)) {
        throw new RoomStageError('你已经在台上。')
      }

      if (stageQueue.length >= room.maxStageMembers) {
        throw new RoomStageError('上台人数已满。')
      }

      stageQueue.push(userId)
      const roomPlayback = await this.getRoomPlayback(room)
      if (roomPlayback.status === 'idle') {
        await this.advancePlaybackLocked(room, onlineMembers, -1)
      }
      return this.toSnapshot(room, onlineMembers)
    })
  }

  async leaveStage({
    roomCode,
    requesterUserId,
    requesterSocketId,
    targetUserId,
  }: {
    roomCode: string
    requesterUserId: string
    requesterSocketId: string
    targetUserId: string
  }): Promise<RoomSocketSnapshot> {
    return this.withRoomLock(roomCode, async () => {
      const onlineMembers = this.onlineRooms.get(roomCode)
      const requester = onlineMembers?.get(requesterUserId)

      if (!onlineMembers || !requester?.socketIds.has(requesterSocketId)) {
        throw new RoomStageError('请先加入房间后再操作上台队列。')
      }

      const room = await this.findRoom(roomCode)
      if (!room) {
        throw new RoomStageError('房间不存在或已被清理。')
      }

      if (targetUserId !== requesterUserId && room.ownerId !== requesterUserId) {
        throw new RoomStageError('只有房主可以让其他成员下台。')
      }

      const removedStageIndex = this.removeStageMember(roomCode, targetUserId)
      if (removedStageIndex < 0) {
        throw new RoomStageError('该成员当前不在台上。')
      }

      const playback = await this.getRoomPlayback(room)
      if (playback.activeMemberId === targetUserId) {
        await this.advancePlaybackLocked(room, onlineMembers, removedStageIndex - 1)
      }

      return this.toSnapshot(room, onlineMembers)
    })
  }

  async updateRoomSettings({
    roomCode,
    userId,
    socketId,
    payload,
  }: {
    roomCode: string
    userId: string
    socketId: string
    payload: unknown
  }): Promise<RoomSocketSnapshot> {
    const settings = normalizeRoomSettingsPayload(payload)

    return this.withRoomLock(roomCode, async () => {
      const onlineMembers = this.onlineRooms.get(roomCode)
      const member = onlineMembers?.get(userId)

      if (!onlineMembers || !member?.socketIds.has(socketId)) {
        throw new RoomSettingsError('请先加入房间后再修改设置。')
      }

      const room = await this.findRoom(roomCode)
      if (!room) throw new RoomSettingsError('房间不存在或已被清理。')
      if (room.ownerId !== userId) throw new RoomSettingsError('只有房主可以修改房间设置。')

      const stageQueue = this.stageQueues.get(roomCode) ?? []
      if (settings.maxMembers < onlineMembers.size) {
        throw new RoomSettingsError('最大人数不能低于当前在线人数。')
      }
      if (settings.maxStageMembers < stageQueue.length) {
        throw new RoomSettingsError('最大上台人数不能低于当前上台人数。')
      }

      let passwordHash = room.passwordHash
      if (settings.passwordAction === 'set' && settings.password) {
        passwordHash = await hashRoomPassword(settings.password)
      } else if (settings.passwordAction === 'remove') {
        passwordHash = null
      }

      const now = new Date()
      const [updatedRoom] = await this.db
        .update(rooms)
        .set({
          name: settings.name,
          tag: settings.tag,
          passwordHash,
          maxMembers: settings.maxMembers,
          maxStageMembers: settings.maxStageMembers,
          lastActiveAt: now,
          updatedAt: now,
        })
        .where(eq(rooms.id, room.id))
        .returning()

      if (!updatedRoom) throw new RoomSettingsError('保存房间设置失败。')
      return this.toSnapshot(updatedRoom, onlineMembers)
    })
  }

  // 由房主删除房间及其级联关联数据，并同步清理当前 Socket 进程的房间状态。
  async dissolveRoom({
    roomCode,
    userId,
    socketId,
  }: {
    roomCode: string
    userId: string
    socketId: string
  }): Promise<void> {
    await this.withRoomLock(roomCode, async () => {
      const onlineMembers = this.onlineRooms.get(roomCode)
      const member = onlineMembers?.get(userId)

      if (!onlineMembers || !member?.socketIds.has(socketId)) {
        throw new RoomSettingsError('请先加入房间后再解散房间。')
      }

      const room = await this.findRoom(roomCode)
      if (!room) throw new RoomSettingsError('房间不存在或已被清理。')
      if (room.ownerId !== userId) throw new RoomSettingsError('只有房主可以解散房间。')

      await this.db.delete(rooms).where(eq(rooms.id, room.id))

      this.clearPlaybackTimer(roomCode)
      this.stageQueues.delete(roomCode)
      this.skipVotes.delete(roomCode)
      this.onlineRooms.delete(roomCode)

      for (const [memberId, activeRoomCode] of this.userRoomCodes) {
        if (activeRoomCode === roomCode) this.userRoomCodes.delete(memberId)
      }
    })
  }

  async getUserPlaylist(userId: string): Promise<UserRoomPlaylistItem[]> {
    const items = await this.db
      .select()
      .from(userRoomPlaylistItems)
      .where(eq(userRoomPlaylistItems.userId, userId))
      .orderBy(asc(userRoomPlaylistItems.position), asc(userRoomPlaylistItems.createdAt))

    return items.map(item => this.toPlaylistItem(item))
  }

  async addPlaylistSong({
    roomCode,
    userId,
    socketId,
    song: rawSong,
  }: {
    roomCode: string
    userId: string
    socketId: string
    song: unknown
  }): Promise<UserRoomPlaylistItem[]> {
    const song = normalizePlaylistSong(rawSong)

    return this.withRoomLock(roomCode, async () => {
      await this.assertRoomMember(roomCode, userId, socketId)
      const existing = await this.db
        .select({ id: userRoomPlaylistItems.id })
        .from(userRoomPlaylistItems)
        .where(
          and(
            eq(userRoomPlaylistItems.userId, userId),
            eq(userRoomPlaylistItems.songId, song.id),
          ),
        )
        .limit(1)

      if (existing.length > 0) throw new RoomPlaylistError('这首歌已经在你的上台歌单中。')

      await this.db.transaction(async tx => {
        await tx
          .update(userRoomPlaylistItems)
          .set({
            position: sql`${userRoomPlaylistItems.position} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(userRoomPlaylistItems.userId, userId))

        await tx.insert(userRoomPlaylistItems).values({
          id: `room_item_${randomBytes(12).toString('base64url')}`,
          userId,
          songId: song.id,
          name: song.name,
          artists: song.artists,
          albumName: song.albumName,
          coverUrl: song.coverUrl,
          durationMs: song.duration,
          position: 0,
        })
      })

      return this.finishPlaylistMutation(userId, roomCode)
    })
  }

  async removePlaylistSong({
    roomCode,
    userId,
    socketId,
    itemId,
  }: {
    roomCode: string
    userId: string
    socketId: string
    itemId: unknown
  }): Promise<UserRoomPlaylistItem[]> {
    const normalizedItemId = normalizeItemId(itemId)

    return this.withRoomLock(roomCode, async () => {
      await this.assertRoomMember(roomCode, userId, socketId)
      await this.db.transaction(async tx => {
        const [removed] = await tx
          .delete(userRoomPlaylistItems)
          .where(
            and(
              eq(userRoomPlaylistItems.id, normalizedItemId),
              eq(userRoomPlaylistItems.userId, userId),
            ),
          )
          .returning({ position: userRoomPlaylistItems.position })

        if (!removed) throw new RoomPlaylistError('这首歌不在你的上台歌单中。')

        await tx
          .update(userRoomPlaylistItems)
          .set({
            position: sql`${userRoomPlaylistItems.position} - 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(userRoomPlaylistItems.userId, userId),
              gt(userRoomPlaylistItems.position, removed.position),
            ),
          )
      })

      return this.finishPlaylistMutation(userId, roomCode)
    })
  }

  async reorderPlaylistSong({
    roomCode,
    userId,
    socketId,
    itemId,
    toIndex,
  }: {
    roomCode: string
    userId: string
    socketId: string
    itemId: unknown
    toIndex: unknown
  }): Promise<UserRoomPlaylistItem[]> {
    const normalizedItemId = normalizeItemId(itemId)
    const targetIndex = normalizePlaylistIndex(toIndex)

    return this.withRoomLock(roomCode, async () => {
      await this.assertRoomMember(roomCode, userId, socketId)
      const items = await this.getUserPlaylistRows(userId)
      const sourceIndex = items.findIndex(item => item.id === normalizedItemId)

      if (sourceIndex < 0) throw new RoomPlaylistError('这首歌不在你的上台歌单中。')
      if (targetIndex < 0 || targetIndex >= items.length) {
        throw new RoomPlaylistError('播放列表位置不正确。')
      }

      const [moved] = items.splice(sourceIndex, 1)
      if (!moved) throw new RoomPlaylistError('播放列表排序失败。')
      items.splice(targetIndex, 0, moved)
      await this.replacePlaylistRows(userId, items)

      return this.finishPlaylistMutation(userId, roomCode)
    })
  }

  async shufflePlaylist({
    roomCode,
    userId,
    socketId,
  }: {
    roomCode: string
    userId: string
    socketId: string
  }): Promise<UserRoomPlaylistItem[]> {
    return this.withRoomLock(roomCode, async () => {
      await this.assertRoomMember(roomCode, userId, socketId)
      const items = await this.getUserPlaylistRows(userId)
      shuffleInPlace(items)
      await this.replacePlaylistRows(userId, items)
      return this.finishPlaylistMutation(userId, roomCode)
    })
  }

  async importLikedPlaylist({
    roomCode,
    userId,
    socketId,
  }: {
    roomCode: string
    userId: string
    socketId: string
  }): Promise<UserRoomPlaylistItem[]> {
    return this.withRoomLock(roomCode, async () => {
      await this.assertRoomMember(roomCode, userId, socketId)
      const liked = await this.db
        .select()
        .from(likedSongs)
        .where(eq(likedSongs.userId, userId))
        .orderBy(desc(likedSongs.createdAt))

      const rows = liked.map((song, index) => ({
        id: `room_item_${randomBytes(12).toString('base64url')}_${index}`,
        userId,
        songId: song.songId,
        name: song.name,
        artists: song.artists,
        albumName: song.albumName,
        coverUrl: song.coverUrl,
        durationMs: song.durationMs,
        position: index,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))

      await this.replacePlaylistRows(userId, rows)
      return this.finishPlaylistMutation(userId, roomCode)
    })
  }

  async clearPlaylist({
    roomCode,
    userId,
    socketId,
  }: {
    roomCode: string
    userId: string
    socketId: string
  }): Promise<UserRoomPlaylistItem[]> {
    return this.withRoomLock(roomCode, async () => {
      await this.assertRoomMember(roomCode, userId, socketId)
      await this.db.delete(userRoomPlaylistItems).where(eq(userRoomPlaylistItems.userId, userId))
      return this.finishPlaylistMutation(userId, roomCode)
    })
  }

  async reportPlaybackError({
    roomCode,
    userId,
    socketId,
    payload,
  }: {
    roomCode: string
    userId: string
    socketId: string
    payload: unknown
  }): Promise<RoomPlaybackState> {
    const errorPayload = normalizePlaybackErrorPayload(payload)

    return this.withRoomLock(roomCode, async () => {
      const { room, onlineMembers } = await this.assertRoomMember(roomCode, userId, socketId)
      const playback = await this.getRoomPlayback(room)

      if (
        playback.status !== 'playing' ||
        playback.version !== errorPayload.version ||
        playback.currentItemId !== errorPayload.itemId ||
        playback.activeMemberId !== userId
      ) {
        return playback
      }

      await this.advancePlaybackLocked(room, onlineMembers, playback.activeStageIndex)
      return this.getRoomPlayback(room)
    })
  }

  async skipCurrentPlayback({
    roomCode,
    userId,
    socketId,
  }: {
    roomCode: string
    userId: string
    socketId: string
  }): Promise<RoomPlaybackState> {
    return this.withRoomLock(roomCode, async () => {
      const { room, onlineMembers } = await this.assertRoomPlaybackMember(roomCode, userId, socketId)
      const playback = await this.getRoomPlayback(room)

      if (playback.status !== 'playing' || playback.activeMemberId !== userId) {
        throw new RoomPlaybackError('只有当前播放者可以切歌。')
      }

      await this.advancePlaybackLocked(room, onlineMembers, playback.activeStageIndex)
      return this.getRoomPlayback(room)
    })
  }

  async voteSkipPlayback({
    roomCode,
    userId,
    socketId,
  }: {
    roomCode: string
    userId: string
    socketId: string
  }): Promise<RoomPlaybackState> {
    return this.withRoomLock(roomCode, async () => {
      const { room, onlineMembers } = await this.assertRoomPlaybackMember(roomCode, userId, socketId)
      const playback = await this.getRoomPlayback(room)

      if (playback.status !== 'playing' || !playback.activeMemberId) {
        throw new RoomPlaybackError('当前没有可以投票跳过的歌曲。')
      }

      if (playback.activeMemberId === userId) {
        throw new RoomPlaybackError('当前播放者可以直接切歌，无需投票。')
      }

      const eligibleVoterIds = [...onlineMembers.keys()].filter(memberId => memberId !== playback.activeMemberId)
      if (eligibleVoterIds.length === 0) {
        throw new RoomPlaybackError('当前没有其他在线成员可以投票。')
      }

      const voteRecord = this.getSkipVoteRecord(room.code, playback.version)
      voteRecord.voterIds.add(userId)

      const allEligibleVoted = eligibleVoterIds.every(memberId => voteRecord.voterIds.has(memberId))
      if (allEligibleVoted) {
        await this.advancePlaybackLocked(room, onlineMembers, playback.activeStageIndex)
        return this.getRoomPlayback(room)
      }

      const updatedPlayback = await this.getRoomPlayback(room)
      this.onPlaybackChanged?.(room.code, updatedPlayback)
      return updatedPlayback
    })
  }

  private async findRoom(roomCode: string) {
    const [room] = await this.db.select().from(rooms).where(eq(rooms.code, roomCode)).limit(1)
    return room
  }

  private async findActiveRoomCode(userId: string) {
    const [active] = await this.db
      .select({ code: rooms.code })
      .from(roomMembers)
      .innerJoin(rooms, eq(roomMembers.roomId, rooms.id))
      .where(and(eq(roomMembers.userId, userId), isNull(roomMembers.leftAt)))
      .limit(1)

    return active?.code ?? null
  }

  private async assertRoomMember(roomCode: string, userId: string, socketId: string) {
    const onlineMembers = this.onlineRooms.get(roomCode)
    const member = onlineMembers?.get(userId)

    if (!onlineMembers || !member?.socketIds.has(socketId)) {
      throw new RoomPlaylistError('请先加入房间后再操作上台歌单。')
    }

    const room = await this.findRoom(roomCode)
    if (!room) throw new RoomPlaylistError('房间不存在或已被清理。')

    return { room, onlineMembers }
  }

  private async assertRoomPlaybackMember(roomCode: string, userId: string, socketId: string) {
    const onlineMembers = this.onlineRooms.get(roomCode)
    const member = onlineMembers?.get(userId)

    if (!onlineMembers || !member?.socketIds.has(socketId)) {
      throw new RoomPlaybackError('请先加入房间后再操作播放。')
    }

    const room = await this.findRoom(roomCode)
    if (!room) throw new RoomPlaybackError('房间不存在或已被清理。')

    return { room, onlineMembers }
  }

  private async getUserPlaylistRows(userId: string) {
    return this.db
      .select()
      .from(userRoomPlaylistItems)
      .where(eq(userRoomPlaylistItems.userId, userId))
      .orderBy(asc(userRoomPlaylistItems.position), asc(userRoomPlaylistItems.createdAt))
  }

  private async replacePlaylistRows(userId: string, rows: Array<typeof userRoomPlaylistItems.$inferInsert>) {
    const now = new Date()
    const normalizedRows = rows.map((row, position) => ({
      ...row,
      userId,
      position,
      updatedAt: now,
    }))

    await this.db.transaction(async tx => {
      await tx.delete(userRoomPlaylistItems).where(eq(userRoomPlaylistItems.userId, userId))
      if (normalizedRows.length > 0) await tx.insert(userRoomPlaylistItems).values(normalizedRows)
    })
  }

  private async finishPlaylistMutation(userId: string, roomCode: string) {
    const playlist = await this.getUserPlaylist(userId)
    this.onPlaylistChanged?.(userId, playlist)

    const room = await this.findRoom(roomCode)
    const onlineMembers = this.onlineRooms.get(roomCode)
    if (room && onlineMembers && this.stageQueues.get(roomCode)?.includes(userId)) {
      const playback = await this.getRoomPlayback(room)
      if (playback.status === 'idle') {
        await this.advancePlaybackLocked(room, onlineMembers, -1)
      }
    }

    return playlist
  }

  private async getRoomPlayback(room: RoomRow): Promise<RoomPlaybackState> {
    let [state] = await this.db
      .select()
      .from(roomPlaybackStates)
      .where(eq(roomPlaybackStates.roomId, room.id))
      .limit(1)

    if (!state) {
      const [created] = await this.db
        .insert(roomPlaybackStates)
        .values({ roomId: room.id })
        .returning()
      state = created
    }

    if (!state) throw new RoomPlaybackError('读取房间播放状态失败。')
    return this.toPlaybackState(state, room.code)
  }

  private async advancePlaybackLocked(
    room: RoomRow,
    onlineMembers: Map<string, OnlineMember>,
    startFromIndex: number,
  ) {
    const stageQueue = this.stageQueues.get(room.code) ?? []
    const current = await this.getRoomPlayback(room)
    const now = new Date()
    this.skipVotes.delete(room.code)

    if (stageQueue.length === 0) {
      const idle = await this.savePlaybackState(room, {
        activeStageIndex: -1,
        activeMemberId: null,
        currentItemId: null,
        song: null,
        status: 'idle',
        startedAt: null,
        startOffsetMs: 0,
        durationMs: 0,
        version: current.version + 1,
      })
      this.clearPlaybackTimer(room.code)
      this.onPlaybackChanged?.(room.code, idle)
      return idle
    }

    const initialIndex = Math.max(-1, startFromIndex)

    for (let offset = 1; offset <= stageQueue.length; offset += 1) {
      const stageIndex = (initialIndex + offset) % stageQueue.length
      const memberId = stageQueue[stageIndex]
      if (!memberId || !onlineMembers.has(memberId)) continue

      const playlist = await this.getUserPlaylistRows(memberId)
      const nextSong = playlist[0]
      if (!nextSong) continue

      const nextPlaylist = [...playlist.slice(1), { ...nextSong, position: playlist.length - 1 }]
      await this.replacePlaylistRows(memberId, nextPlaylist)
      const playlistAfterRotation = await this.getUserPlaylist(memberId)
      this.onPlaylistChanged?.(memberId, playlistAfterRotation)

      const playback = await this.savePlaybackState(room, {
        activeStageIndex: stageIndex,
        activeMemberId: memberId,
        currentItemId: nextSong.id,
        song: this.toPlaylistItem(nextSong),
        status: 'playing',
        startedAt: now,
        startOffsetMs: 0,
        durationMs: Math.max(1000, nextSong.durationMs),
        version: current.version + 1,
      })

      this.schedulePlaybackTimer(room.code, playback)
      this.onPlaybackChanged?.(room.code, playback)
      return playback
    }

    const idle = await this.savePlaybackState(room, {
      activeStageIndex: initialIndex >= 0 ? initialIndex % stageQueue.length : -1,
      activeMemberId: null,
      currentItemId: null,
      song: null,
      status: 'idle',
      startedAt: null,
      startOffsetMs: 0,
      durationMs: 0,
      version: current.version + 1,
    })
    this.clearPlaybackTimer(room.code)
    this.onPlaybackChanged?.(room.code, idle)
    return idle
  }

  private async savePlaybackState(
    room: RoomRow,
    next: {
      activeStageIndex: number
      activeMemberId: string | null
      currentItemId: string | null
      song: UserRoomPlaylistItem | null
      status: 'idle' | 'playing'
      startedAt: Date | null
      startOffsetMs: number
      durationMs: number
      version: number
    },
  ) {
    const values = {
      roomId: room.id,
      activeStageIndex: next.activeStageIndex,
      activeMemberId: next.activeMemberId,
      currentItemId: next.currentItemId,
      currentSongId: next.song?.id ?? null,
      currentSongName: next.song?.name ?? null,
      currentSongArtists: next.song?.artists ?? null,
      currentSongAlbumName: next.song?.albumName ?? null,
      currentSongCoverUrl: next.song?.coverUrl ?? null,
      currentSongDurationMs: next.song ? next.durationMs : null,
      status: next.status,
      startedAt: next.startedAt,
      startOffsetMs: next.startOffsetMs,
      version: next.version,
      updatedAt: new Date(),
    } as const

    const updateValues = {
      activeStageIndex: values.activeStageIndex,
      activeMemberId: values.activeMemberId,
      currentItemId: values.currentItemId,
      currentSongId: values.currentSongId,
      currentSongName: values.currentSongName,
      currentSongArtists: values.currentSongArtists,
      currentSongAlbumName: values.currentSongAlbumName,
      currentSongCoverUrl: values.currentSongCoverUrl,
      currentSongDurationMs: values.currentSongDurationMs,
      status: values.status,
      startedAt: values.startedAt,
      startOffsetMs: values.startOffsetMs,
      version: values.version,
      updatedAt: values.updatedAt,
    }
    const [saved] = await this.db
      .insert(roomPlaybackStates)
      .values(values)
      .onConflictDoUpdate({ target: roomPlaybackStates.roomId, set: updateValues })
      .returning()

    if (!saved) throw new RoomPlaybackError('保存房间播放状态失败。')
    return this.toPlaybackState(saved, room.code)
  }

  private schedulePlaybackTimer(roomCode: string, playback: RoomPlaybackState) {
    this.clearPlaybackTimer(roomCode)
    if (playback.status !== 'playing' || !playback.startedAt) return

    const endAt = new Date(playback.startedAt).getTime() + playback.startOffsetMs + playback.durationMs
    const delay = Math.max(250, endAt - Date.now())
    const timer = setTimeout(() => {
      void this.advanceRoomPlayback(roomCode)
    }, delay)
    this.playbackTimers.set(roomCode, timer)
  }

  private clearPlaybackTimer(roomCode: string) {
    const timer = this.playbackTimers.get(roomCode)
    if (timer) clearTimeout(timer)
    this.playbackTimers.delete(roomCode)
  }

  private async advanceRoomPlayback(roomCode: string) {
    return this.withRoomLock(roomCode, async () => {
      const room = await this.findRoom(roomCode)
      const onlineMembers = this.onlineRooms.get(roomCode)
      if (!room || !onlineMembers) return null

      const playback = await this.getRoomPlayback(room)
      return this.advancePlaybackLocked(room, onlineMembers, playback.activeStageIndex)
    })
  }

  private toPlaylistItem(item: typeof userRoomPlaylistItems.$inferSelect): UserRoomPlaylistItem {
    return {
      itemId: item.id,
      id: item.songId,
      name: item.name,
      artists: item.artists,
      albumName: item.albumName,
      coverUrl: item.coverUrl ?? undefined,
      duration: item.durationMs,
      position: item.position,
    }
  }

  private toPlaybackState(
    state: typeof roomPlaybackStates.$inferSelect,
    roomCode: string,
  ): RoomPlaybackState {
    const hasSong =
      state.status === 'playing' &&
      state.currentItemId !== null &&
      state.currentSongId !== null &&
      state.currentSongName !== null &&
      state.currentSongArtists !== null &&
      state.currentSongAlbumName !== null &&
      state.currentSongDurationMs !== null

    return {
      status: state.status === 'playing' ? 'playing' : 'idle',
      version: state.version,
      activeStageIndex: state.activeStageIndex,
      activeMemberId: state.activeMemberId,
      currentItemId: state.currentItemId,
      song: hasSong
        ? {
            id: state.currentSongId!,
            name: state.currentSongName!,
            artists: state.currentSongArtists!,
            albumName: state.currentSongAlbumName!,
            coverUrl: state.currentSongCoverUrl ?? undefined,
            duration: state.currentSongDurationMs!,
          }
        : null,
      startedAt: state.startedAt?.toISOString() ?? null,
      startOffsetMs: state.startOffsetMs,
      durationMs: state.currentSongDurationMs ?? 0,
      ...this.getSkipVoteSummary(roomCode, state.version, state.activeMemberId),
    }
  }

  private getSkipVoteRecord(roomCode: string, version: number): SkipVoteRecord {
    const existing = this.skipVotes.get(roomCode)
    if (existing?.version === version) return existing

    const created: SkipVoteRecord = { version, voterIds: new Set<string>() }
    this.skipVotes.set(roomCode, created)
    return created
  }

  private removeSkipVote(roomCode: string, userId: string) {
    this.skipVotes.get(roomCode)?.voterIds.delete(userId)
  }

  private getSkipVoteSummary(roomCode: string, version: number, activeMemberId: string | null) {
    if (!activeMemberId) {
      return { skipVoteCount: 0, skipVoteRequired: 0, skipVoterIds: [] }
    }

    const eligibleVoterIds = [...(this.onlineRooms.get(roomCode)?.keys() ?? [])].filter(
      memberId => memberId !== activeMemberId,
    )
    const voteRecord = this.skipVotes.get(roomCode)
    const skipVoterIds =
      voteRecord?.version === version
        ? eligibleVoterIds.filter(memberId => voteRecord.voterIds.has(memberId))
        : []

    return {
      skipVoteCount: skipVoterIds.length,
      skipVoteRequired: eligibleVoterIds.length,
      skipVoterIds,
    }
  }

  private async getRecentMessages(roomId: string): Promise<RoomRealtimeChatMessage[]> {
    const messages = await this.db
      .select({
        id: roomMessages.id,
        senderId: roomMessages.userId,
        senderName: user.name,
        content: roomMessages.content,
        createdAt: roomMessages.createdAt,
      })
      .from(roomMessages)
      .innerJoin(user, eq(roomMessages.userId, user.id))
      .where(eq(roomMessages.roomId, roomId))
      .orderBy(desc(roomMessages.createdAt))
      .limit(RECENT_MESSAGE_LIMIT)

    return messages.reverse().map(message => ({
      id: message.id,
      senderId: message.senderId,
      senderName: message.senderName,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    }))
  }

  private getOnlineRoom(roomCode: string) {
    const existing = this.onlineRooms.get(roomCode)
    if (existing) return existing

    const created = new Map<string, OnlineMember>()
    this.onlineRooms.set(roomCode, created)
    return created
  }

  private getStageQueue(roomCode: string) {
    const existing = this.stageQueues.get(roomCode)
    if (existing) return existing

    const created: string[] = []
    this.stageQueues.set(roomCode, created)
    return created
  }

  private removeStageMember(roomCode: string, userId: string) {
    const stageQueue = this.stageQueues.get(roomCode)
    if (!stageQueue) return -1

    const index = stageQueue.indexOf(userId)
    if (index < 0) return -1

    stageQueue.splice(index, 1)
    if (stageQueue.length === 0) this.stageQueues.delete(roomCode)
    return index
  }

  private getMembers(onlineMembers: Map<string, OnlineMember>): RoomPresenceMember[] {
    return [...onlineMembers.values()]
      .sort((left, right) => {
        const timeDifference = left.joinedAt.getTime() - right.joinedAt.getTime()
        return timeDifference || left.id.localeCompare(right.id)
      })
      .map(member => ({
        id: member.id,
        name: member.name,
        joinedAt: member.joinedAt.toISOString(),
      }))
  }

  private getStageMembers(
    roomCode: string,
    onlineMembers: Map<string, OnlineMember>,
    ownerId: string,
  ): RoomPresenceMember[] {
    const stageQueue = this.stageQueues.get(roomCode)
    if (!stageQueue) return []

    const activeMemberIds = stageQueue.filter(memberId => onlineMembers.has(memberId))

    if (activeMemberIds.length !== stageQueue.length) {
      if (activeMemberIds.length === 0) {
        this.stageQueues.delete(roomCode)
      } else {
        this.stageQueues.set(roomCode, activeMemberIds)
      }
    }

    return activeMemberIds.flatMap(memberId => {
      const member = onlineMembers.get(memberId)
      if (!member) return []

      return [
        {
          id: member.id,
          name: member.name,
          joinedAt: member.joinedAt.toISOString(),
          isOwner: member.id === ownerId,
        },
      ]
    })
  }

  // 将数据库房间行和内存在线成员转为可以安全下发给浏览器的快照。
  private toSnapshot(room: RoomRow, onlineMembers: Map<string, OnlineMember>): RoomSocketSnapshot {
    const members = this.getMembers(onlineMembers).map(member => ({
      ...member,
      isOwner: member.id === room.ownerId,
    }))

    return {
      room: {
        code: room.code,
        name: room.name,
        tag: room.tag,
        isPasswordProtected: Boolean(room.passwordHash),
        maxMembers: room.maxMembers,
        maxStageMembers: room.maxStageMembers,
        memberCount: members.length,
      },
      members,
      stageMembers: this.getStageMembers(room.code, onlineMembers, room.ownerId),
    }
  }

  // 将同一房间的修改排队，避免并发加入时绕过人数上限。
  private async withRoomLock<T>(roomCode: string, operation: () => Promise<T>) {
    const previous = this.roomLocks.get(roomCode) ?? Promise.resolve()
    let releaseCurrent: () => void = () => {}
    const current = new Promise<void>(resolve => {
      releaseCurrent = resolve
    })
    const queued = previous.then(() => current)

    this.roomLocks.set(roomCode, queued)
    await previous

    try {
      return await operation()
    } finally {
      releaseCurrent()
      if (this.roomLocks.get(roomCode) === queued) this.roomLocks.delete(roomCode)
    }
  }

  // 将同一用户跨房间的加入与离开操作串行化，配合数据库唯一索引避免同时进入两间房。
  private async withUserLock<T>(userId: string, operation: () => Promise<T>) {
    const previous = this.userLocks.get(userId) ?? Promise.resolve()
    let releaseCurrent: () => void = () => {}
    const current = new Promise<void>(resolve => {
      releaseCurrent = resolve
    })
    const queued = previous.then(() => current)

    this.userLocks.set(userId, queued)
    await previous

    try {
      return await operation()
    } finally {
      releaseCurrent()
      if (this.userLocks.get(userId) === queued) this.userLocks.delete(userId)
    }
  }
}
