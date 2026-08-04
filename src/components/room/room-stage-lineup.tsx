import { PlusOutlined } from '@ant-design/icons'
import { Avatar } from 'antd'

import type { StageMember } from '@/types/room'

type RoomStageLineupProps = {
  members: StageMember[]
  activeStageIndex: number
  isRoomHost: boolean
  canJoinStage: boolean
  onJoinStage: () => void
  onLeaveStage: (memberId: string) => void
}

export function RoomStageLineup({
  members,
  activeStageIndex,
  isRoomHost,
  canJoinStage,
  onJoinStage,
  onLeaveStage,
}: RoomStageLineupProps) {
  return (
    <div className="flex items-start gap-5 overflow-x-auto px-1 py-2">
      {members.map((member, index) => {
        const isPlaying = index === activeStageIndex
        const canLeaveStage = member.isCurrentUser || isRoomHost

        return (
          <div key={member.id} className="flex w-16 shrink-0 flex-col items-center text-center">
            <span className="group relative block h-[52px] w-[52px]">
              <Avatar size={52} style={{ backgroundColor: member.avatarColor }} className="!font-semibold !text-white">
                {member.name.slice(0, 1)}
              </Avatar>
              {canLeaveStage ? (
                <button
                  type="button"
                  aria-label={`让 ${member.name} 下台`}
                  onClick={() => onLeaveStage(member.id)}
                  className="absolute inset-0 grid place-items-center rounded-full bg-[#222a30]/75 text-xs font-semibold text-white opacity-0 hover:opacity-100 group-hover:opacity-100"
                >
                  下台
                </button>
              ) : null}
            </span>
            <span className="mt-2 w-full truncate text-sm font-medium text-[#34454f]">{member.name}</span>
            <span className={`mt-1 text-[11px] ${isPlaying ? 'text-[#1e88e5]' : 'text-transparent'}`}>
              播放中
            </span>
          </div>
        )
      })}
      {canJoinStage ? (
        <button
          type="button"
          onClick={onJoinStage}
          className="flex w-16 shrink-0 flex-col items-center text-center"
          aria-label="上台"
        >
          <span className="grid h-[52px] w-[52px] place-items-center rounded-full border border-dashed border-[#9ccff7] bg-[#f5fbff] text-lg text-[#1e88e5] hover:bg-[#eaf6ff]">
            <PlusOutlined />
          </span>
          <span className="mt-2 text-sm font-medium text-[#1e88e5]">上台</span>
          <span className="mt-1 text-[11px] text-transparent">占位</span>
        </button>
      ) : null}
    </div>
  )
}
