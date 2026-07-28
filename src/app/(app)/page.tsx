"use client";

import { ArrowRightOutlined, CustomerServiceOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Card, Col, Row, Typography } from "antd";
import Link from "next/link";

import { PageHeading } from "@/components/layout/page-heading";

const quickActions = [
  { title: "搜索音乐", description: "从音乐 API 搜索歌曲、歌手和公开歌单。", icon: <SearchOutlined />, href: "/search" },
  { title: "整理音乐库", description: "管理你创建或导入到本站的歌单。", icon: <CustomerServiceOutlined />, href: "/library" },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
      <PageHeading
        eyebrow="欢迎来到 Ziro音乐站"
        title="你的音乐，等你点亮"
        description="这是播放器的第一版页面骨架。接下来将逐步接入搜索、播放、登录和歌单数据。"
      />
      <Row gutter={[20, 20]}>
        {quickActions.map((item) => (
          <Col key={item.href} xs={24} md={12}>
            <Card className="h-full shadow-sm" styles={{ body: { padding: 24 } }}>
              <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-violet-100 text-xl text-violet-600">{item.icon}</div>
              <Typography.Title level={3} className="!mb-2">{item.title}</Typography.Title>
              <Typography.Paragraph type="secondary">{item.description}</Typography.Paragraph>
              <Link href={item.href}>
                <Button type="link" className="!px-0" icon={<ArrowRightOutlined />} iconPlacement="end">查看页面</Button>
              </Link>
            </Card>
          </Col>
        ))}
      </Row>
    </main>
  );
}
