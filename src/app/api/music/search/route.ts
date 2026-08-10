import { type NextRequest, NextResponse } from 'next/server'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

// 用于保留搜索接口单首歌曲原始字段，并补充专辑封面地址。
type MusicSearchSong = {
  id: number
  album?: {
    picUrl?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

// 用于读取搜索接口结果中的歌曲列表，同时保留上游的其他响应字段。
type MusicSearchResponse = {
  result?: {
    songs?: MusicSearchSong[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

// 用于读取歌曲详情接口返回的歌曲 ID 与标准专辑封面地址。
type SongDetailResponse = {
  songs?: Array<{
    id: number
    al?: {
      picUrl?: string
    }
  }>
}

async function enrichSearchCoverUrls(data: MusicSearchResponse, musicApiBaseUrl: string) {
  const songs = data.result?.songs
  const songIds = songs?.map(song => song.id).filter(Number.isSafeInteger) ?? []

  if (songIds.length === 0) return data

  try {
    const detailUrl = new URL('/song/detail', musicApiBaseUrl)
    detailUrl.searchParams.set('ids', songIds.join(','))
    const detailResponse = await fetch(detailUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })

    if (!detailResponse.ok) return data

    const detailData = (await detailResponse.json()) as SongDetailResponse
    const coverUrls = new Map(
      (detailData.songs ?? [])
        .filter(song => typeof song.al?.picUrl === 'string' && song.al.picUrl.length > 0)
        .map(song => [song.id, song.al!.picUrl]),
    )

    if (coverUrls.size === 0 || !data.result?.songs) return data

    return {
      ...data,
      result: {
        ...data.result,
        songs: data.result.songs.map(song => ({
          ...song,
          album: {
            ...song.album,
            picUrl: song.album?.picUrl ?? coverUrls.get(song.id),
          },
        })),
      },
    }
  } catch {
    // 封面补全失败不影响搜索主流程，前端会回退为歌曲首字。
    return data
  }
}

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

    const data = (await response.json()) as MusicSearchResponse

    if (!response.ok) {
      return NextResponse.json(
        { message: '音乐服务返回了错误', upstream: data },
        { status: response.status },
      )
    }

    return NextResponse.json(await enrichSearchCoverUrls(data, musicApiBaseUrl))
  } catch {
    return NextResponse.json(
      { message: '无法连接本地音乐 API，请确认 3002 服务正在运行' },
      { status: 502 },
    )
  }
}
