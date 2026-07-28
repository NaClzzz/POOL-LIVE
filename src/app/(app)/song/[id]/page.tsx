"use client";

import { PlayCircleFilled } from "@ant-design/icons";
import { Button, Card, Col, Row, Skeleton, Typography } from "antd";

import { PageHeading } from "@/components/layout/page-heading";

export default function SongDetailPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
      <PageHeading eyebrow="歌曲详情" title="歌曲信息" description="这里会根据歌曲 ID 显示封面、歌手、专辑和同步歌词。" />
      <Card className="shadow-sm">
        <Row gutter={[32, 24]} align="middle">
          <Col xs={24} sm={8}><div className="aspect-square rounded-2xl bg-gradient-to-br from-violet-400 via-fuchsia-400 to-rose-300" /></Col>
          <Col xs={24} sm={16}>
            <Skeleton active paragraph={{ rows: 3 }} />
            <Button type="primary" size="large" icon={<PlayCircleFilled />} disabled>播放歌曲</Button>
          </Col>
        </Row>
      </Card>
      <Card title="歌词" className="mt-6 shadow-sm">
        <Typography.Paragraph type="secondary" className="!mb-0">获取歌词后，这里会显示滚动歌词与当前行高亮。</Typography.Paragraph>
      </Card>
    </main>
  );
}
