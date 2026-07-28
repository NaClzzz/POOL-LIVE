"use client";

import { ImportOutlined, PlayCircleFilled } from "@ant-design/icons";
import { Button, Card, Col, Row, Typography } from "antd";

import { PageHeading } from "@/components/layout/page-heading";
import { SongListPlaceholder } from "@/components/music/song-list-placeholder";

export default function PlaylistDetailPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
      <PageHeading eyebrow="歌单详情" title="歌单名称" description="公开歌单导入和站内歌单详情都会使用这个页面。" />
      <Card className="mb-6 shadow-sm">
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} sm="auto"><div className="h-36 w-36 rounded-2xl bg-gradient-to-br from-sky-400 to-violet-500" /></Col>
          <Col flex="auto">
            <Typography.Paragraph type="secondary">暂无简介。接入数据后会显示歌单封面、创建者和歌曲数量。</Typography.Paragraph>
            <div className="flex flex-wrap gap-3">
              <Button type="primary" icon={<PlayCircleFilled />} disabled>播放全部</Button>
              <Button icon={<ImportOutlined />} disabled>导入到我的音乐库</Button>
            </div>
          </Col>
        </Row>
      </Card>
      <SongListPlaceholder />
    </main>
  );
}
