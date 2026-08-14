import { desc, eq } from 'drizzle-orm'

import { likedSongs } from '@/db/schema'
import { getCurrentSession } from '@/lib/auth-session'
import { db } from '@/lib/drizzle'
import { LikedSongValidationError, parseLikedSongInput } from '@/lib/liked-songs/validation'

export const runtime = 'nodejs'

export async function GET() {
  const session = await getCurrentSession()

  if (!session) {
    return Response.json({ message: '请先登录后再读取喜欢的音乐。' }, { status: 401 })
  }

  try {
    const songs = await db
      .select()
      .from(likedSongs)
      .where(eq(likedSongs.userId, session.user.id))
      .orderBy(desc(likedSongs.createdAt))

    return Response.json(
      {
        songs: songs.map(song => ({
          song_id: song.songId,
          name: song.name,
          artists: song.artists,
          album_name: song.albumName,
          cover_url: song.coverUrl,
          duration_ms: song.durationMs,
          created_at: song.createdAt,
        })),
      },
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
    const createdRows = await db
      .insert(likedSongs)
      .values({
        userId: session.user.id,
        songId: song.song_id,
        name: song.name,
        artists: song.artists,
        albumName: song.album_name,
        coverUrl: song.cover_url,
        durationMs: song.duration_ms,
      })
      .onConflictDoNothing({ target: [likedSongs.userId, likedSongs.songId] })
      .returning({ songId: likedSongs.songId })

    const created = createdRows.length === 1

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
    const deletedRows = await db
      .delete(likedSongs)
      .where(eq(likedSongs.userId, session.user.id))
      .returning({ songId: likedSongs.songId })

    return Response.json({ deletedCount: deletedRows.length })
  } catch {
    return Response.json({ message: '清空喜欢的音乐失败，请稍后再试。' }, { status: 500 })
  }
}
