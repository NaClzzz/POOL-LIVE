export type LikedSong = {
  song_id: number
  name: string
  artists: string
  album_name: string
  cover_url: string | null
  duration_ms: number
  created_at?: string
}

export type LikedSongInput = Omit<LikedSong, 'created_at'>
