import { getCurrentSession } from '@/lib/auth-session'
import { database } from '@/lib/database'
import { LikedSongValidationError, parseLikedSongInput } from '@/lib/liked-songs/validation'

export const runtime = 'nodejs'

type LikedSongRow = {
  song_id: string
  name: string
  artists: string
  album_name: string
  cover_url: string | null
  duration_ms: number
  created_at: Date
}

export async function GET() {
  const session = await getCurrentSession()

  if (!session) {
    return Response.json({ message: '请先登录后再读取喜欢的音乐。' }, { status: 401 })
  }

  try {
    const result = await database.query<LikedSongRow>(
      `
        SELECT
          song_id::text AS song_id,
          name,
          artists,
          album_name,
          cover_url,
          duration_ms,
          created_at
        FROM public.liked_songs
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
      [session.user.id],
    )

    const songs = result.rows.map(song => ({
      song_id: Number(song.song_id),
      name: song.name,
      artists: song.artists,
      album_name: song.album_name,
      cover_url: song.cover_url,
      duration_ms: song.duration_ms,
      created_at: song.created_at.toISOString(),
    }))

    return Response.json(
      { songs },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch {
    return Response.json({ message: '读取喜欢的音乐失败，请稍后再试。' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getCurrentSession()

  if (!session) {
    return Response.json({ message: '请先登录后再收藏歌曲。' }, { status: 401 })
  }

  try {
    const song = parseLikedSongInput(await request.json())
    const result = await database.query(
      `
        INSERT INTO public.liked_songs (
          user_id,
          song_id,
          name,
          artists,
          album_name,
          cover_url,
          duration_ms
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id, song_id) DO NOTHING
      `,
      [
        session.user.id,
        song.song_id,
        song.name,
        song.artists,
        song.album_name,
        song.cover_url,
        song.duration_ms,
      ],
    )

    const created = result.rowCount === 1

    return Response.json(
      {
        message: created ? '收藏成功。' : '这首歌已经在你的喜欢列表中。',
        created,
      },
      { status: created ? 201 : 200 },
    )
  } catch (error) {
    if (error instanceof LikedSongValidationError) {
      return Response.json({ message: error.message }, { status: 400 })
    }

    if (error instanceof SyntaxError) {
      return Response.json({ message: '请求数据不是有效的 JSON。' }, { status: 400 })
    }

    return Response.json({ message: '收藏歌曲失败，请稍后再试。' }, { status: 500 })
  }
}

export async function DELETE() {
  const session = await getCurrentSession()

  if (!session) {
    return Response.json({ message: '请先登录后再清空喜欢的音乐。' }, { status: 401 })
  }

  try {
    const result = await database.query(
      `
        DELETE FROM public.liked_songs
        WHERE user_id = $1
      `,
      [session.user.id],
    )

    return Response.json({ deletedCount: result.rowCount ?? 0 })
  } catch {
    return Response.json({ message: '清空喜欢的音乐失败，请稍后再试。' }, { status: 500 })
  }
}
