import type { LikedSongInput } from '@/types/liked-song'

export const LIKED_SONGS_CHANGED_EVENT = 'pool:liked-songs-changed'

export type LikedSongsChangedDetail = {
  song: LikedSongInput
  isLiked: boolean
}

export function notifyLikedSongsChanged(detail: LikedSongsChangedDetail) {
  window.dispatchEvent(new CustomEvent<LikedSongsChangedDetail>(LIKED_SONGS_CHANGED_EVENT, { detail }))
}
