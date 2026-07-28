import { type NextRequest, NextResponse } from 'next/server'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export async function GET(request: NextRequest) {
  const keywords = request.nextUrl.searchParams.get('keywords')?.trim()

  if (!keywords) {
    return NextResponse.json({ message: '请输入搜索关键词' }, { status: 400 })
  }

  if (keywords.length > 80) {
    return NextResponse.json({ message: '搜索关键词不能超过 80 个字符' }, { status: 400 })
  }

  const musicApiBaseUrl = process.env.MUSIC_API_BASE_URL

  if (!musicApiBaseUrl) {
    return NextResponse.json({ message: '未配置 MUSIC_API_BASE_URL' }, { status: 500 })
  }

  const limitParam = request.nextUrl.searchParams.get('limit')
  const requestedLimit = limitParam ? Number(limitParam) : NaN
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT

  const offsetParam = request.nextUrl.searchParams.get('offset')
  const requestedOffset = offsetParam ? Number(offsetParam) : NaN
  const offset = Number.isInteger(requestedOffset)
    ? Math.max(requestedOffset, 0)
    : 0

  const upstreamUrl = new URL('/search', musicApiBaseUrl)
  upstreamUrl.searchParams.set('keywords', keywords)
  upstreamUrl.searchParams.set('limit', String(limit))
  upstreamUrl.searchParams.set('offset', String(offset))

  try {
    const response = await fetch(upstreamUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { message: '音乐服务返回了错误', upstream: data },
        { status: response.status },
      )
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { message: '无法连接本地音乐 API，请确认 3002 服务正在运行' },
      { status: 502 },
    )
  }
}
