import { getCurrentSession } from '@/lib/auth-session'
import { database } from '@/lib/database'
import { LikedSongValidationError, parseLikedSongInput } from '@/lib/liked-songs/validation'
import type { LikedSongInput } from '@/types/liked-song'

export const runtime = 'nodejs'

const MAX_IMPORT_SONGS = 500

type ImportLikedSongsBody = {
  songs?: unknown
}

type InsertedSongRow = {
  song_id: string
}

function parseImportBody(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new LikedSongValidationError('请求数据格式不正确。')
  }

  const { songs } = body as ImportLikedSongsBody

  if (!Array.isArray(songs) || songs.length === 0) {
    throw new LikedSongValidationError('请提供至少一首要导入的歌曲。')
  }

  if (songs.length > MAX_IMPORT_SONGS) {
    throw new LikedSongValidationError(`单次最多导入 ${MAX_IMPORT_SONGS} 首歌曲。`)
  }

  const uniqueSongs = new Map<number, LikedSongInput>()

  for (const song of songs) {
    const parsedSong = parseLikedSongInput(song)
    uniqueSongs.set(parsedSong.song_id, parsedSong)
  }

  return [...uniqueSongs.values()]
}

export async function POST(request: Request) {
  const session = await getCurrentSession()

  if (!session) {
    return Response.json({ message: '请先登录后再导入歌曲。' }, { status: 401 })
  }

  let songs: LikedSongInput[]

  try {
    songs = parseImportBody(await request.json())
  } catch (error) {
    const message =
      error instanceof LikedSongValidationError
        ? error.message
        : '请求数据不是有效的 JSON。'

    return Response.json({ message }, { status: 400 })
  }

  const values: Array<string | number | null> = [session.user.id]
  const rows = songs.map((song, index) => {
    const start = index * 6 + 2

    values.push(
      song.song_id,
      song.name,
      song.artists,
      song.album_name,
      song.cover_url,
      song.duration_ms,
    )

    return `($1, $${start}, $${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5})`
  })

  try {
    const result = await database.query<InsertedSongRow>(
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
        VALUES ${rows.join(', ')}
        ON CONFLICT (user_id, song_id) DO NOTHING
        RETURNING song_id::text AS song_id
      `,
      values,
    )

    const addedSongIds = result.rows.map(row => Number(row.song_id))

    return Response.json(
      {
        addedSongIds,
        addedCount: addedSongIds.length,
        skippedCount: songs.length - addedSongIds.length,
      },
      { status: addedSongIds.length > 0 ? 201 : 200 },
    )
  } catch {
    return Response.json({ message: '导入歌曲失败，请稍后再试。' }, { status: 500 })
  }
}
