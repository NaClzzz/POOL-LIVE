'use client'

import { EnterOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { PageHeading } from '@/components/layout/page-heading'
import { RoomCreateModal } from '@/components/room/room-create-modal'
import type { CreateRoomFormValues } from '@/components/room/room-create-modal'
import { RoomRecommendationCard } from '@/components/room/room-recommendation-card'
import { recommendedRooms, saveRoomDraft } from '@/lib/room/demo-data'
import type { RoomDraft } from '@/types/room'

function createRoomCode() {
  return `pool-${Math.random().toString(36).slice(2, 8)}`
}

export default function RoomsLobbyPage() {
  const router = useRouter()
  const [form] = Form.useForm<CreateRoomFormValues>()
  const [roomCode, setRoomCode] = useState('')
  const [password, setPassword] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [joinError, setJoinError] = useState('')

  function enterRoom(code: string) {
    const normalizedCode = code.trim()

    if (!normalizedCode) {
      setJoinError('请输入房间号后再加入。')
      return
    }

    setJoinError('')
    router.push(`/rooms/${encodeURIComponent(normalizedCode)}`)
  }

  function handleCreateRoom(values: CreateRoomFormValues) {
    const draft: RoomDraft = {
      code: createRoomCode(),
      name: values.name.trim(),
      tag: values.tag.trim(),
      isPasswordProtected: values.isPasswordProtected,
      maxMembers: values.maxMembers,
      maxStageMembers: values.maxStageMembers,
    }

    saveRoomDraft(draft)
    setIsCreateModalOpen(false)
    form.resetFields()
    router.push(`/rooms/${draft.code}`)
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false)
    form.resetFields()
  }

  return (
    <main className="desktop-page">
      <PageHeading
        eyebrow="POOL LIVE"
        title="一起听"
        description="创建一个听歌房，按上台顺序轮流播放彼此的歌单。当前版本为房间前端原型。"
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
                placeholder="房间密码（演示阶段不校验）"
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
          <Button size="large" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)}>
            创建房间
          </Button>
        </div>
        <Typography.Text type="secondary" className="mt-3 block">
          加密房间会显示锁图标。正式接入后将由服务端验证密码和房间资格。
        </Typography.Text>
      </Card>

      {joinError ? <Alert className="mb-6" type="error" showIcon message={joinError} /> : null}

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="m-0 text-xs font-semibold tracking-[0.16em] text-[#1e88e5]">RECOMMENDED ROOMS</p>
            <h2 className="m-0 mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#222a30]">推荐房间</h2>
          </div>
          <Typography.Text type="secondary">均为本地模拟房间</Typography.Text>
        </div>
        <div className="grid grid-cols-3 gap-5">
          {recommendedRooms.map(room => (
            <RoomRecommendationCard key={room.room.code} room={room} onJoin={enterRoom} />
          ))}
        </div>
      </section>

      <RoomCreateModal
        form={form}
        open={isCreateModalOpen}
        onClose={closeCreateModal}
        onCreate={handleCreateRoom}
      />
    </main>
  )
}
