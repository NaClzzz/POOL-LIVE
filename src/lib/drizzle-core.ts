import { drizzle } from 'drizzle-orm/node-postgres'

import * as schema from '@/db/schema'
import { database } from './database-core'

// Next.js 与独立 Socket 进程共用的 Drizzle 数据库入口，复用同一个 pg Pool。
export const db = drizzle({ client: database, schema })
