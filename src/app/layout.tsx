import type { Metadata } from 'next'
import { AntdRegistry } from '@ant-design/nextjs-registry'

import './globals.css'

export const metadata: Metadata = {
  title: 'POOL · 音乐播放器',
  description: '一个个人音乐播放器项目',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  )
}
