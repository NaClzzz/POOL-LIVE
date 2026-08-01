'use client'

import { ImportOutlined, PlayCircleFilled } from '@ant-design/icons'
import { Button, Card, Typography } from 'antd'

import { PageHeading } from '@/components/layout/page-heading'

export default function PlaylistDetailPage() {
  return (
    <main className="desktop-page desktop-page--narrow">
      <PageHeading
        eyebrow="PLAYLIST DETAIL"
        title="歌单名称"
        description="公开歌单导入和站内歌单详情都会使用这个页面。"
      />
      <Card styles={{ body: { padding: 32 } }}>
        <div className="grid grid-cols-[180px_1fr] items-center gap-9">
          <div className="relative h-44 w-44 overflow-hidden bg-[#42a5f5]">
            <span className="absolute bottom-[-10px] left-3 font-display text-[88px] leading-none text-white/25">P</span>
            <span className="absolute left-4 top-4 text-[10px] font-semibold tracking-[0.2em] text-white">PLAYLIST</span>
          </div>
          <div>
            <Typography.Paragraph className="!mb-7 !max-w-xl !leading-8 !text-[#71808a]">
              暂无简介。接入数据后会显示歌单封面、创建者和歌曲数量。
            </Typography.Paragraph>
            <div className="flex gap-3">
              <Button type="primary" icon={<PlayCircleFilled />} disabled>
                播放全部
              </Button>
              <Button icon={<ImportOutlined />} disabled>
                导入到我的音乐库
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </main>
  )
}
