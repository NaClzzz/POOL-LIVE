import { getCurrentSession } from '@/lib/auth-session'
import { database } from '@/lib/database'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ songId: string }>
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await getCurrentSession()

  if (!session) {
    return Response.json({ message: '请先登录后再取消收藏。' }, { status: 401 })
  }

  const { songId: songIdParam } = await params
  const songId = Number(songIdParam)

  if (!/^\d+$/.test(songIdParam) || !Number.isSafeInteger(songId) || songId <= 0) {
    return Response.json({ message: '歌曲 ID 格式不正确。' }, { status: 400 })
  }

  try {
    const result = await database.query(
      `
        DELETE FROM public.liked_songs
        WHERE user_id = $1 AND song_id = $2
      `,
      [session.user.id, songId],
    )

    if (result.rowCount === 0) {
      return Response.json({ message: '这首歌不在你的喜欢列表中。' }, { status: 404 })
    }

    return Response.json({ message: '已取消收藏。' })
  } catch {
    return Response.json({ message: '取消收藏失败，请稍后再试。' }, { status: 500 })
  }
}
