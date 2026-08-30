'use client'

import { EnterOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { PageHeading } from '@/components/layout/page-heading'
import { RoomCreateModal } from '@/components/room/room-create-modal'
import type { CreateRoomFormValues } from '@/components/room/room-create-modal'
import { RoomRecommendationCard } from '@/components/room/room-recommendation-card'
import type { RoomListItem } from '@/types/room'

type RoomsApiResponse = {
  rooms: RoomListItem[]
  myRoom: RoomListItem | null
}

type CreateRoomApiResponse = {
  room: RoomListItem
}

// 读响应体
async function readResponseBody(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>
}

// 读message
function getResponseMessage(body: unknown, fallback: string) {
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
    return body.message
  }

  return fallback
}

async function fetchPublicRooms() {
  const response = await fetch('/api/rooms', { cache: 'no-store' })
  const body = await readResponseBody(response)

  if (!response.ok) {
    throw new Error(getResponseMessage(body, '读取公开房间失败，请稍后重试。'))
  }

  const data = body as RoomsApiResponse
  return {
    rooms: Array.isArray(data.rooms) ? data.rooms : [],
    myRoom: data.myRoom?.code ? data.myRoom : null,
  }
}

function saveJoinPassword(roomCode: unknown, password: string) {
  const normalizedRoomCode = typeof roomCode === 'string' ? roomCode.trim().toLowerCase() : ''
  if (!normalizedRoomCode) return

  const key = `pool-room-password:${normalizedRoomCode}`

  if (password) {
    sessionStorage.setItem(key, password)
    return
  }

  sessionStorage.removeItem(key)
}

export default function RoomsLobbyPage() {
  const router = useRouter()
  const [form] = Form.useForm<CreateRoomFormValues>()
  const [roomCode, setRoomCode] = useState('')
  const [password, setPassword] = useState('')
  const [rooms, setRooms] = useState<RoomListItem[]>([])
  const [myRoom, setMyRoom] = useState<RoomListItem | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [roomListError, setRoomListError] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [isLoadingRooms, setIsLoadingRooms] = useState(true)
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)

  async function retryLoadRooms() {
    setIsLoadingRooms(true)
    setRoomListError('')

    try {
      const result = await fetchPublicRooms()
      setRooms(result.rooms)
      setMyRoom(result.myRoom)
      setRoomListError('')
    } catch (error) {
      setRoomListError(error instanceof Error ? error.message : '读取公开房间失败，请稍后重试。')
    } finally {
      setIsLoadingRooms(false)
    }
  }

  useEffect(() => {
    let isCurrent = true

    async function loadInitialRooms() {
      try {
        const result = await fetchPublicRooms()
        if (!isCurrent) return

        setRooms(result.rooms)
        setMyRoom(result.myRoom)
      } catch (error) {
        if (!isCurrent) return

        setRoomListError(error instanceof Error ? error.message : '读取公开房间失败，请稍后重试。')
      } finally {
        if (isCurrent) setIsLoadingRooms(false)
      }
    }

    void loadInitialRooms()

    return () => {
      isCurrent = false
    }
  }, [])

  function enterRoom(code: string) {
    const normalizedCode = code.trim()

    if (!normalizedCode) {
      setJoinError('请输入房间号后再加入。')
      return
    }

    setJoinError('')
    saveJoinPassword(normalizedCode, password)
    router.push(`/rooms/${encodeURIComponent(normalizedCode)}`)
  }

  async function handleCreateRoom(values: CreateRoomFormValues) {
    setCreateError(null)
    setIsCreatingRoom(true)

    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          tag: values.tag,
          password: values.isPasswordProtected ? values.password : null,
          maxMembers: values.maxMembers,
          maxStageMembers: values.maxStageMembers,
        }),
      })
      const body = await readResponseBody(response)

      if (!response.ok) {
        const existingRoom = body as Partial<CreateRoomApiResponse>
        if (response.status === 409 && existingRoom.room?.code) {
          setMyRoom(existingRoom.room)
          setIsCreateModalOpen(false)
          form.resetFields()
          return
        }

        throw new Error(getResponseMessage(body, '创建房间失败，请稍后重试。'))
      }

      const data = body as CreateRoomApiResponse
      if (!data.room?.code) {
        throw new Error('创建房间失败，请稍后重试。')
      }

      saveJoinPassword(data.room.code, values.isPasswordProtected ? (values.password ?? '') : '')
      setMyRoom(data.room)
      setIsCreateModalOpen(false)
      form.resetFields()
      router.push(`/rooms/${encodeURIComponent(data.room.code)}`)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : '创建房间失败，请稍后重试。')
    } finally {
      setIsCreatingRoom(false)
    }
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false)
    setCreateError(null)
    form.resetFields()
  }

  return (
    <main className="desktop-page">
      <PageHeading
        eyebrow="POOL LIVE"
        title="一起听"
        description="创建一个听歌房，按上台顺序轮流播放彼此的歌单。"
      />

      <Card className="mb-6" styles={{ body: { padding: 28 } }}>
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <Typography.Text className="!mb-2 !block !font-semibold">加入房间</Typography.Text>
            <div className="grid grid-cols-[1fr_280px] gap-3">
              <Input
                size="large"
                allowClear
                placeholder="输入房间号"
                value={roomCode}
                onChange={event => setRoomCode(event.target.value)}
                onPressEnter={() => enterRoom(roomCode)}
              />
              <Input.Password
                size="large"
                placeholder="密码房请输入房间密码"
                value={password}
                onChange={event => setPassword(event.target.value)}
                onPressEnter={() => enterRoom(roomCode)}
              />
            </div>
          </div>
          <Button
            type="primary"
            size="large"
            icon={<EnterOutlined />}
            disabled={!roomCode.trim()}
            onClick={() => enterRoom(roomCode)}
          >
            加入
          </Button>
          <Button
            size="large"
            icon={myRoom ? <EnterOutlined /> : <PlusOutlined />}
            onClick={() => {
              if (myRoom) {
                enterRoom(myRoom.code)
                return
              }

              setIsCreateModalOpen(true)
            }}
          >
            {myRoom ? '我的房间' : '创建房间'}
          </Button>
        </div>
      </Card>

      {joinError ? <Alert className="mb-6" type="error" showIcon message={joinError} /> : null}

      <section className="mt-4">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="m-0 text-xs font-semibold tracking-[0.16em] text-[#1e88e5]">
              PUBLIC ROOMS
            </p>
            <h2 className="m-0 mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#222a30]">
              推荐房间
            </h2>
          </div>
          <Typography.Text type="secondary">来自真实公开房间</Typography.Text>
        </div>
        {roomListError ? (
          <Alert
            type="error"
            showIcon
            message={roomListError}
            action={
              <Button size="small" onClick={retryLoadRooms}>
                重试
              </Button>
            }
          />
        ) : null}
        {isLoadingRooms ? (
          <Typography.Text type="secondary">正在加载公开房间…</Typography.Text>
        ) : null}
        {!isLoadingRooms && !roomListError && rooms.length === 0 ? (
          <Card styles={{ body: { padding: 24 } }}>
            <Typography.Text type="secondary">
              暂时没有可加入的公开房间，创建一个吧。
            </Typography.Text>
          </Card>
        ) : null}
        {rooms.length > 0 ? (
          <div className="grid grid-cols-3 gap-5">
            {rooms.map(room => (
              <RoomRecommendationCard key={room.code} room={room} onJoin={enterRoom} />
            ))}
          </div>
        ) : null}
      </section>

      <RoomCreateModal
        form={form}
        open={isCreateModalOpen}
        onClose={closeCreateModal}
        onCreate={handleCreateRoom}
        confirmLoading={isCreatingRoom}
        error={createError}
      />
    </main>
  )
}
