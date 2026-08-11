import type { Metadata } from 'next'
import { AntdRegistry } from '@ant-design/nextjs-registry'

import './globals.css'

export const metadata: Metadata = {
  title: 'POOL · LIVE',
  description: 'by Ziro',
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
