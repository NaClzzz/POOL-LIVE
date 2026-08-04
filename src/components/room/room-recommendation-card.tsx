import { LockOutlined, TeamOutlined, UserSwitchOutlined } from '@ant-design/icons'
import { Button, Card, Tag, Typography } from 'antd'

import type { RoomCardData } from '@/types/room'

type RoomRecommendationCardProps = {
  room: RoomCardData
  onJoin: (roomCode: string) => void
}

export function RoomRecommendationCard({ room, onJoin }: RoomRecommendationCardProps) {
  return (
    <Card styles={{ body: { padding: 24 } }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <Tag color="blue" className="!m-0">
              {room.room.tag}
            </Tag>
            {room.room.isPasswordProtected ? <LockOutlined className="text-xs text-[#71808a]" /> : null}
          </div>
          <Typography.Title level={4} className="!mb-2 !truncate">
            {room.room.name}
          </Typography.Title>
          <Typography.Text type="secondary" className="!block !text-sm">
            {room.currentHostName} 正在播放 · {room.currentSong.name}
          </Typography.Text>
        </div>
        <button
          type="button"
          aria-label={`加入 ${room.room.name}`}
          onClick={() => onJoin(room.room.code)}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#eaf6ff] text-lg font-semibold text-[#1e88e5] hover:bg-[#dceffa]"
        >
          ♪
        </button>
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-[#edf0f2] pt-4">
        <div className="flex items-center gap-4 text-xs text-[#71808a]">
          <span className="inline-flex items-center gap-1.5">
            <TeamOutlined />
            {room.memberCount}/{room.room.maxMembers} 人
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UserSwitchOutlined />
            {room.stageCount}/{room.room.maxStageMembers} 上台
          </span>
        </div>
        <Button type="link" className="!px-0" onClick={() => onJoin(room.room.code)}>
          加入房间
        </Button>
      </div>
    </Card>
  )
}
