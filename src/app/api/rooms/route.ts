import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm'

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
  passwordHash: string | null
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
    isPasswordProtected: Boolean(room.passwordHash),
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
    const session = await getCurrentSession()
    const roomFields = {
      code: rooms.code,
      name: rooms.name,
      tag: rooms.tag,
      passwordHash: rooms.passwordHash,
      maxMembers: rooms.maxMembers,
      maxStageMembers: rooms.maxStageMembers,
      currentMemberCount: rooms.currentMemberCount,
      ownerName: user.name,
      lastActiveAt: rooms.lastActiveAt,
    }
    const activeRoomCondition = or(
      gt(rooms.currentMemberCount, 0),
      gt(rooms.emptyExpiresAt, now),
    )

    const [result, myRoom] = await Promise.all([
      db
        .select(roomFields)
        .from(rooms)
        .innerJoin(user, eq(rooms.ownerId, user.id))
        .where(and(isNull(rooms.passwordHash), activeRoomCondition))
        .orderBy(desc(rooms.lastActiveAt))
        .limit(ROOM_LIST_LIMIT),
      session
        ? db
            .select(roomFields)
            .from(rooms)
            .innerJoin(user, eq(rooms.ownerId, user.id))
            .where(and(eq(rooms.ownerId, session.user.id), activeRoomCondition))
            .orderBy(desc(rooms.lastActiveAt))
            .limit(1)
        : Promise.resolve([]),
    ])

    return Response.json(
      { rooms: result.map(toRoomListItem), myRoom: myRoom[0] ? toRoomListItem(myRoom[0]) : null },
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
    const outcome = await db.transaction(async tx => {
      // 同一用户的多标签页创建请求先串行执行，避免并发绕过“一人一个有效房间”。
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${session.user.id}))`)

      const now = new Date()
      const [existingRoom] = await tx
        .select({
          code: rooms.code,
          name: rooms.name,
          tag: rooms.tag,
          passwordHash: rooms.passwordHash,
          maxMembers: rooms.maxMembers,
          maxStageMembers: rooms.maxStageMembers,
          currentMemberCount: rooms.currentMemberCount,
          lastActiveAt: rooms.lastActiveAt,
        })
        .from(rooms)
        .where(
          and(
            eq(rooms.ownerId, session.user.id),
            or(gt(rooms.currentMemberCount, 0), gt(rooms.emptyExpiresAt, now)),
          ),
        )
        .orderBy(desc(rooms.lastActiveAt))
        .limit(1)

      if (existingRoom) return { kind: 'existing' as const, room: existingRoom }

      const passwordHash = input.password ? await hashRoomPassword(input.password) : null
      for (let attempt = 0; attempt < ROOM_CODE_RETRY_LIMIT; attempt += 1) {
        const [createdRoom] = await tx
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
            passwordHash: rooms.passwordHash,
            maxMembers: rooms.maxMembers,
            maxStageMembers: rooms.maxStageMembers,
            currentMemberCount: rooms.currentMemberCount,
            lastActiveAt: rooms.lastActiveAt,
          })

        if (createdRoom) return { kind: 'created' as const, room: createdRoom }
      }

      return { kind: 'unavailable' as const }
    })

    if (outcome.kind === 'existing') {
      return Response.json(
        {
          message: '你已经创建了一个有效房间，请进入“我的房间”。',
          room: toRoomListItem({ ...outcome.room, ownerName: session.user.name }),
        },
        { status: 409 },
      )
    }

    if (outcome.kind === 'unavailable') {
      return Response.json({ message: '生成房间号失败，请重试。' }, { status: 503 })
    }

    return Response.json(
      { room: toRoomListItem({ ...outcome.room, ownerName: session.user.name }) },
      { status: 201 },
    )
  } catch {
    return Response.json({ message: '创建房间失败，请稍后重试。' }, { status: 500 })
  }
}
