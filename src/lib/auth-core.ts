import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

import { account, session, user, verification } from '@/db/schema'
import { db } from './drizzle-core'

// Next.js API 与独立 Socket 进程共用同一份 Better Auth 配置和 PostgreSQL 连接。
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
})
