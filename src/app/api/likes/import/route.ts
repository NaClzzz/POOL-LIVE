import { likedSongs } from '@/db/schema'
import { getCurrentSession } from '@/lib/auth-session'
import { db } from '@/lib/drizzle'
import { LikedSongValidationError, parseLikedSongInput } from '@/lib/liked-songs/validation'
import type { LikedSongInput } from '@/types/liked-song'

export const runtime = 'nodejs'

const MAX_IMPORT_SONGS = 500

type ImportLikedSongsBody = {
  songs?: unknown
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

  try {
    const insertedRows = await db
      .insert(likedSongs)
      .values(
        songs.map(song => ({
          userId: session.user.id,
          songId: song.song_id,
          name: song.name,
          artists: song.artists,
          albumName: song.album_name,
          coverUrl: song.cover_url,
          durationMs: song.duration_ms,
        })),
      )
      .onConflictDoNothing({ target: [likedSongs.userId, likedSongs.songId] })
      .returning({ songId: likedSongs.songId })

    const addedSongIds = insertedRows.map(row => row.songId)

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
