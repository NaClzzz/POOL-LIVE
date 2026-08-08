import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is required to connect to PostgreSQL.')
}

type DatabaseGlobal = typeof globalThis & {
  poolDatabase?: Pool
}

const databaseGlobal = globalThis as DatabaseGlobal

// 开发时热更新会重复加载模块；复用同一个连接池，避免不断创建 PostgreSQL 连接。
export const database = databaseGlobal.poolDatabase ?? new Pool({ connectionString })

if (process.env.NODE_ENV !== 'production') {
  databaseGlobal.poolDatabase = database
}
