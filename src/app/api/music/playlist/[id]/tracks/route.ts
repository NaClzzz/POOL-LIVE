import { NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{ id: string }>
}

const MAX_IMPORT_SONGS = 500

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params

  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ message: '歌单 ID 必须是数字' }, { status: 400 })
  }

  const musicApiBaseUrl = process.env.MUSIC_API_BASE_URL

  if (!musicApiBaseUrl) {
    return NextResponse.json({ message: '未配置 MUSIC_API_BASE_URL' }, { status: 500 })
  }

  const upstreamUrl = new URL('/playlist/track/all', musicApiBaseUrl)
  upstreamUrl.searchParams.set('id', id)
  upstreamUrl.searchParams.set('limit', String(MAX_IMPORT_SONGS))
  upstreamUrl.searchParams.set('offset', '0')

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
