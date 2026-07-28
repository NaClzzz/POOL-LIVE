"use client";

import { MoreOutlined, PlayCircleFilled } from "@ant-design/icons";
import { Avatar, Button, Card, List, Typography } from "antd";

const placeholderTracks = [
  "在这里展示歌曲",
  "接入音乐 API 后显示搜索结果",
  "播放器会从这里加入播放队列",
];

export function SongListPlaceholder() {
  return (
    <Card className="shadow-sm">
      <List
        dataSource={placeholderTracks}
        renderItem={(title, index) => (
          <List.Item actions={[<Button key="more" type="text" shape="circle" icon={<MoreOutlined />} />]}>
            <List.Item.Meta
              avatar={<Avatar className="!bg-slate-200 !text-slate-500">{index + 1}</Avatar>}
              title={<Typography.Text>{title}</Typography.Text>}
              description="歌手名称 · 专辑名称"
            />
            <Button type="text" shape="circle" icon={<PlayCircleFilled className="!text-violet-500" />} />
          </List.Item>
        )}
      />
    </Card>
  );
}
