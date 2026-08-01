'use client'

import { PlayCircleFilled } from '@ant-design/icons'
import { Button, Card, Skeleton, Typography } from 'antd'

import { PageHeading } from '@/components/layout/page-heading'

export default function SongDetailPage() {
  return (
    <main className="desktop-page desktop-page--narrow">
      <PageHeading
        eyebrow="TRACK DETAIL"
        title="歌曲信息"
        description="这里会根据歌曲 ID 显示封面、歌手、专辑和同步歌词。"
      />
      <Card styles={{ body: { padding: 32 } }}>
        <div className="grid grid-cols-[260px_1fr] items-center gap-10">
          <div className="relative aspect-square overflow-hidden bg-[#42a5f5]">
            <span className="absolute bottom-[-16px] left-4 font-display text-[110px] leading-none text-white/25">M</span>
            <span className="absolute left-5 top-5 text-xs font-semibold tracking-[0.2em] text-white">MUSIC</span>
          </div>
          <div>
            <Skeleton paragraph={{ rows: 3 }} />
            <Button type="primary" size="large" icon={<PlayCircleFilled />} disabled>
              播放歌曲
            </Button>
          </div>
        </div>
      </Card>
      <Card title="歌词" className="mt-6" styles={{ body: { padding: 32 } }}>
        <Typography.Paragraph className="!mb-0 !leading-8 !text-[#71808a]">
          歌词数据接入后会显示在这里，并与底部播放器保持同步。
        </Typography.Paragraph>
      </Card>
    </main>
  )
}
