import { betterAuth } from 'better-auth'

import { database } from './database-core'

// Next.js API 与独立 Socket 进程共用同一份 Better Auth 配置和 PostgreSQL 连接。
export const auth = betterAuth({
  database,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
})
