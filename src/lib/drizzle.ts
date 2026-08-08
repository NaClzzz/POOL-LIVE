import 'server-only'

import { drizzle } from 'drizzle-orm/node-postgres'

import { database } from '@/lib/database'
import * as schema from '@/db/schema'

// Drizzle 复用项目现有的 pg Pool；不会额外创建一套 PostgreSQL 连接池。
export const db = drizzle({ client: database, schema })
