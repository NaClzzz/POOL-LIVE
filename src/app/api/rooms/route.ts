import { and, desc, eq, gt, isNull, or } from 'drizzle-orm'

import { user } from '@/db/schema/legacy'
import { rooms } from '@/db/schema/rooms'
import { getCurrentSession } from '@/lib/auth-session'
import { db } from '@/lib/drizzle'
import {
  createRoomCode,
  createRoomId,
  hashRoomPassword,
  parseCreateRoomInput,
  RoomValidationError,
} from '@/lib/room/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ROOM_LIST_LIMIT = 18
const ROOM_CODE_RETRY_LIMIT = 3

function toRoomListItem(room: {
  code: string
  name: string
  tag: string
  maxMembers: number
  maxStageMembers: number
  currentMemberCount: number
  ownerName: string
  lastActiveAt: Date
}) {
  return {
    code: room.code,
    name: room.name,
    tag: room.tag,
    isPasswordProtected: false,
    maxMembers: room.maxMembers,
    maxStageMembers: room.maxStageMembers,
    memberCount: room.currentMemberCount,
    ownerName: room.ownerName,
    lastActiveAt: room.lastActiveAt.toISOString(),
  }
}

export async function GET() {
  try {
    const now = new Date()
    const result = await db
      .select({
        code: rooms.code,
        name: rooms.name,
        tag: rooms.tag,
        maxMembers: rooms.maxMembers,
        maxStageMembers: rooms.maxStageMembers,
        currentMemberCount: rooms.currentMemberCount,
        ownerName: user.name,
        lastActiveAt: rooms.lastActiveAt,
      })
      .from(rooms)
      .innerJoin(user, eq(rooms.ownerId, user.id))
      .where(
        and(
          isNull(rooms.passwordHash),
          or(gt(rooms.currentMemberCount, 0), gt(rooms.emptyExpiresAt, now)),
        ),
      )
      .orderBy(desc(rooms.lastActiveAt))
      .limit(ROOM_LIST_LIMIT)

    return Response.json(
      { rooms: result.map(toRoomListItem) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch {
    return Response.json({ message: '读取公开房间失败，请稍后重试。' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getCurrentSession()

  if (!session) {
    return Response.json({ message: '请先登录后再创建房间。' }, { status: 401 })
  }

  let input

  try {
    input = parseCreateRoomInput(await request.json())
  } catch (error) {
    const message =
      error instanceof RoomValidationError ? error.message : '请求数据不是有效的 JSON。'

    return Response.json({ message }, { status: 400 })
  }

  try {
    const passwordHash = input.password ? await hashRoomPassword(input.password) : null

    for (let attempt = 0; attempt < ROOM_CODE_RETRY_LIMIT; attempt += 1) {
      const [createdRoom] = await db
        .insert(rooms)
        .values({
          id: createRoomId(),
          code: createRoomCode(),
          name: input.name,
          tag: input.tag,
          passwordHash,
          ownerId: session.user.id,
          maxMembers: input.maxMembers,
          maxStageMembers: input.maxStageMembers,
        })
        .onConflictDoNothing({ target: rooms.code })
        .returning({
          code: rooms.code,
          name: rooms.name,
          tag: rooms.tag,
          maxMembers: rooms.maxMembers,
          maxStageMembers: rooms.maxStageMembers,
          currentMemberCount: rooms.currentMemberCount,
          lastActiveAt: rooms.lastActiveAt,
        })

      if (!createdRoom) continue

      return Response.json(
        {
          room: {
            ...toRoomListItem({ ...createdRoom, ownerName: session.user.name }),
            isPasswordProtected: passwordHash !== null,
          },
        },
        { status: 201 },
      )
    }

    return Response.json({ message: '生成房间号失败，请重试。' }, { status: 503 })
  } catch {
    return Response.json({ message: '创建房间失败，请稍后重试。' }, { status: 500 })
  }
}
