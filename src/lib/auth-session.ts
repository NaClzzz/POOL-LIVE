import 'server-only'

import { cache } from 'react'
import { headers } from 'next/headers'

import { auth } from '@/lib/auth'

// 同一次服务端渲染中复用 Session 查询，后续 API 也会沿用同一套身份来源。
export const getCurrentSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
)
