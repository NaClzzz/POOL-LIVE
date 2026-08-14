import 'server-only'

// Drizzle 复用项目现有的 pg Pool；不会额外创建一套 PostgreSQL 连接池。
export { db } from './drizzle-core'
