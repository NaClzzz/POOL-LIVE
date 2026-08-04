'use client'

import { ArrowLeftOutlined, LockOutlined, UserSwitchOutlined } from '@ant-design/icons'
import { Avatar, Card, Tag, Typography } from 'antd'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'

import { PageHeading } from '@/components/layout/page-heading'
import { RoomStageLineup } from '@/components/room/room-stage-lineup'
import { getRoomDemo } from '@/lib/room/demo-data'
import { useRoomDemoStore } from '@/store/room-demo-store'

function formatDuration(duration: number) {
  const totalSeconds = Math.floor(duration / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')

  return `${minutes}:${seconds}`
}

export default function RoomPage() {
  const params = useParams<{ roomCode: string }>()
  const roomCode = typeof params.roomCode === 'string' ? params.roomCode : 'pool-demo-room'
  const fallbackRoom = useMemo(() => getRoomDemo(roomCode), [roomCode])
  const currentRoomCode = useRoomDemoStore(state => state.roomCode)
  const room = useRoomDemoStore(state => state.room)
  const stageMembers = useRoomDemoStore(state => state.stageMembers)
  const player = useRoomDemoStore(state => state.player)
  const hasJoinedStage = useRoomDemoStore(state => state.hasJoinedStage)
  const isCurrentUserHost = useRoomDemoStore(state => state.isCurrentUserHost)
  const initializeRoom = useRoomDemoStore(state => state.initializeRoom)
  const joinStage = useRoomDemoStore(state => state.joinStage)
  const leaveStage = useRoomDemoStore(state => state.leaveStage)

  useEffect(() => {
    initializeRoom(roomCode)
  }, [initializeRoom, roomCode])

  const displayRoom = currentRoomCode === roomCode ? room : fallbackRoom.room
  const displayStageMembers = currentRoomCode === roomCode ? stageMembers : fallbackRoom.stageMembers
  const displayPlayer = currentRoomCode === roomCode ? player : fallbackRoom.player
  const displayIsCurrentUserHost =
    currentRoomCode === roomCode ? isCurrentUserHost : fallbackRoom.isCurrentUserHost
  const activeMember =
    displayStageMembers[displayPlayer.activeStageIndex] ?? displayStageMembers[0]
  const activeSong = displayPlayer.activeSong

  return (
    <main className="desktop-page">
      <div className="mb-5">
        <Link
          href="/rooms"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#71808a] hover:text-[#1e88e5]"
        >
          <ArrowLeftOutlined />
          返回一起听
        </Link>
      </div>
      <PageHeading
        eyebrow="POOL LIVE ROOM"
        title={displayRoom.name}
        description={`房间号：${displayRoom.code}。成员按上台顺序从左到右循环播放，当前为前端演示状态。`}
      />

      <Card className="mb-6" styles={{ body: { padding: 28 } }}>
        <div className="mb-7 flex items-center justify-between border-b border-[#edf0f2] pb-5">
          <div className="flex items-center gap-3">
            <Tag color="blue" className="!m-0">
              {displayRoom.tag}
            </Tag>
            {displayRoom.isPasswordProtected ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-[#71808a]">
                <LockOutlined />
                加密房间
              </span>
            ) : null}
          </div>
          <span className="inline-flex items-center gap-2 text-sm text-[#71808a]">
            <UserSwitchOutlined />
            {displayStageMembers.length}/{displayRoom.maxStageMembers} 人已上台
          </span>
        </div>
        <div>
          <p className="m-0 text-sm font-semibold text-[#34454f]">上台成员</p>
          <p className="m-0 mt-1 text-xs text-[#71808a]">顺序固定，播放权从左到右循环。</p>
          <RoomStageLineup
            members={displayStageMembers}
            activeStageIndex={displayPlayer.activeStageIndex}
            isRoomHost={displayIsCurrentUserHost}
            canJoinStage={!hasJoinedStage && displayStageMembers.length < displayRoom.maxStageMembers}
            onJoinStage={joinStage}
            onLeaveStage={leaveStage}
          />
        </div>
      </Card>

      <Card styles={{ body: { padding: 28 } }}>
        <div className="grid grid-cols-[128px_1fr_auto] items-center gap-7">
          <div className="grid aspect-square place-items-center bg-[#eaf6ff] text-4xl font-display text-[#1e88e5]">
            {activeSong?.name.slice(0, 1) ?? '♪'}
          </div>
          <div className="min-w-0">
            <p className="m-0 text-xs font-semibold tracking-[0.16em] text-[#1e88e5]">NOW ON STAGE</p>
            <Typography.Title level={2} className="!mb-2 !mt-2 !truncate">
              {activeSong?.name ?? '等待歌曲'}
            </Typography.Title>
            <Typography.Text type="secondary" className="!block !truncate">
              {activeMember ? `${activeMember.name} 的播放列表 · ${activeSong?.artists ?? ''}` : '等待成员上台'}
            </Typography.Text>
          </div>
          <div className="text-right">
            <Typography.Text type="secondary" className="!block !text-xs">
              当前歌曲
            </Typography.Text>
            <Typography.Text className="!mt-1 !block !font-medium">
              {activeSong ? formatDuration(activeSong.duration) : '—'}
            </Typography.Text>
          </div>
        </div>
        <div className="mt-7 flex items-center gap-3 border-t border-[#edf0f2] pt-5">
          <Avatar style={{ backgroundColor: activeMember?.avatarColor ?? '#42a5f5' }}>
            {activeMember?.name.slice(0, 1) ?? '♪'}
          </Avatar>
          <Typography.Paragraph className="!mb-0 !leading-7 !text-[#71808a]">
            本阶段仅展示播放顺序和只读状态。稍后接入 Socket 后，房主和所有成员将收到同一份服务端播放状态。
          </Typography.Paragraph>
        </div>
      </Card>
      <Typography.Text type="secondary" className="mt-5 block text-center">
        底部可打开我的播放列表和房间聊天
      </Typography.Text>
    </main>
  )
}
