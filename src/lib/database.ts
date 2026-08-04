import 'server-only'

import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is required to connect to PostgreSQL.')
}

type DatabaseGlobal = typeof globalThis & {
  poolDatabase?: Pool
}

const databaseGlobal = globalThis as DatabaseGlobal

// 开发模式热更新会重复执行模块；把 Pool 挂到 globalThis，避免持续创建新连接池。
export const database = databaseGlobal.poolDatabase ?? new Pool({ connectionString })

if (process.env.NODE_ENV !== 'production') {
  databaseGlobal.poolDatabase = database
}
