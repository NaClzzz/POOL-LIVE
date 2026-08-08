import { LockOutlined, TeamOutlined } from '@ant-design/icons'
import { Button, Card, Tag, Typography } from 'antd'

import type { RoomListItem } from '@/types/room'

type RoomRecommendationCardProps = {
  room: RoomListItem
  onJoin: (roomCode: string) => void
}

export function RoomRecommendationCard({ room, onJoin }: RoomRecommendationCardProps) {
  return (
    <Card styles={{ body: { padding: 24 } }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <Tag color="blue" className="!m-0">
              {room.tag}
            </Tag>
            {room.isPasswordProtected ? <LockOutlined className="text-xs text-[#71808a]" /> : null}
          </div>
          <Typography.Title level={4} className="!mb-2 !truncate">
            {room.name}
          </Typography.Title>
          <Typography.Text type="secondary" className="!block !text-sm">
            房主：{room.ownerName || 'POOL 用户'} · 等待成员加入
          </Typography.Text>
        </div>
        <button
          type="button"
          aria-label={`加入 ${room.name}`}
          onClick={() => onJoin(room.code)}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#eaf6ff] text-lg font-semibold text-[#1e88e5] hover:bg-[#dceffa]"
        >
          +
        </button>
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-[#edf0f2] pt-4">
        <div className="flex items-center gap-4 text-xs text-[#71808a]">
          <span className="inline-flex items-center gap-1.5">
            <TeamOutlined />
            {room.memberCount}/{room.maxMembers} 人
          </span>
        </div>
        <Button type="link" className="!px-0" onClick={() => onJoin(room.code)}>
          加入房间
        </Button>
      </div>
    </Card>
  )
}
