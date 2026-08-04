import type { PlayerSong } from '@/types/player'
import type {
  RoomCardData,
  RoomChatMessage,
  RoomDemoData,
  RoomDraft,
  RoomPlayerState,
  StageMember,
} from '@/types/room'

const ROOM_DRAFTS_STORAGE_KEY = 'pool-room-drafts'

function song(
  id: number,
  name: string,
  artists: string,
  albumName: string,
  duration: number,
): PlayerSong {
  return { id, name, artists, albumName, duration }
}

const mockMyLikedSongs: PlayerSong[] = [
  song(186016, '晴天', '周杰伦', '叶惠美', 269000),
  song(347230, '演员', '薛之谦', '绅士', 261000),
  song(29764564, '平凡之路', '朴树', '猎户星座', 302000),
  song(1330348068, '我记得', '赵雷', '署前街少年', 329000),
]

const mockSearchSongs: PlayerSong[] = [
  song(5255980, '稻香', '周杰伦', '魔杰座', 223000),
  song(186018, '七里香', '周杰伦', '七里香', 299000),
  song(347230, '演员', '薛之谦', '绅士', 261000),
  song(186016, '晴天', '周杰伦', '叶惠美', 269000),
  song(1974443814, '想去海边', '夏日入侵企画', '想去海边', 239000),
  song(1463165983, '水星记', '郭顶', '飞行器的执行周期', 325000),
  song(526464293, '起风了', '买辣椒也用券', '起风了', 328000),
  song(1901371647, '反方向的钟', '周杰伦', '范特西', 258000),
]

const stageMembersTemplate: StageMember[] = [
  {
    id: 'member-chunxia',
    name: '春夏',
    avatarColor: '#42a5f5',
    playlist: [
      song(26305515, '夜空中最亮的星', '逃跑计划', '世界', 252000),
      song(1934251776, 'Letting Go', '蔡健雅', 'Goodbye & Hello', 280000),
    ],
  },
  {
    id: 'member-mori',
    name: 'Mori',
    avatarColor: '#7ec8b6',
    playlist: [song(25706282, '突然好想你', '五月天', '后青春期的诗', 258000)],
  },
  {
    id: 'member-yiyi',
    name: '一一',
    avatarColor: '#9ba8f5',
    playlist: [song(1359356908, '来自天堂的魔鬼', 'G.E.M. 邓紫棋', '摩天动物园', 255000)],
  },
]

const currentUserTemplate: StageMember = {
  id: 'member-me',
  name: '我',
  avatarColor: '#f0a85b',
  isCurrentUser: true,
  playlist: mockMyLikedSongs,
}

export const recommendedRooms: RoomCardData[] = [
  {
    room: {
      code: 'midnight-pool',
      name: '深夜慢放局',
      tag: '深夜',
      isPasswordProtected: true,
      maxMembers: 8,
      maxStageMembers: 6,
    },
    memberCount: 5,
    stageCount: 3,
    currentHostName: '春夏',
    currentSong: stageMembersTemplate[0].playlist[0],
  },
  {
    room: {
      code: 'weekend-pop',
      name: '周末流行歌交换',
      tag: '流行',
      isPasswordProtected: false,
      maxMembers: 12,
      maxStageMembers: 8,
    },
    memberCount: 9,
    stageCount: 5,
    currentHostName: 'Mori',
    currentSong: mockSearchSongs[4],
  },
  {
    room: {
      code: 'rainy-window',
      name: '下雨天的窗边',
      tag: '氛围',
      isPasswordProtected: true,
      maxMembers: 6,
      maxStageMembers: 4,
    },
    memberCount: 3,
    stageCount: 2,
    currentHostName: '一一',
    currentSong: mockSearchSongs[5],
  },
]

function cloneSongs(songs: PlayerSong[]) {
  return songs.map(song => ({ ...song }))
}

function cloneStageMembers(members: StageMember[]) {
  return members.map(member => ({ ...member, playlist: cloneSongs(member.playlist) }))
}

function getDefaultPlayerState(activeSong: PlayerSong | null): RoomPlayerState {
  return {
    activeStageIndex: 0,
    currentSongIndex: 0,
    activeSong: activeSong ? { ...activeSong } : null,
    progressSeconds: 72,
  }
}

function getDefaultChatMessages(): RoomChatMessage[] {
  return [
    {
      id: 'welcome-message',
      senderName: 'POOL',
      content: '欢迎来到听歌房。上台后会按从左到右的顺序轮流播放。',
      sentAt: '现在',
    },
    {
      id: 'chunxia-message',
      senderName: '春夏',
      content: '这首歌结束后轮到 Mori 的播放列表～',
      sentAt: '20:18',
    },
  ]
}

function isRoomDraft(value: unknown): value is RoomDraft {
  if (!value || typeof value !== 'object') return false

  const draft = value as Partial<RoomDraft>

  return (
    typeof draft.code === 'string' &&
    typeof draft.name === 'string' &&
    typeof draft.tag === 'string' &&
    typeof draft.isPasswordProtected === 'boolean' &&
    typeof draft.maxMembers === 'number' &&
    typeof draft.maxStageMembers === 'number'
  )
}

export function saveRoomDraft(draft: RoomDraft) {
  if (typeof window === 'undefined') return

  try {
    const value = window.sessionStorage.getItem(ROOM_DRAFTS_STORAGE_KEY)
    const previous = value ? JSON.parse(value) : {}
    const drafts = previous && typeof previous === 'object' ? previous : {}

    window.sessionStorage.setItem(
      ROOM_DRAFTS_STORAGE_KEY,
      JSON.stringify({ ...drafts, [draft.code]: draft }),
    )
  } catch {
    // 房间原型仍可在未启用 sessionStorage 的环境中使用默认数据进入。
  }
}

export function getStoredRoomDraft(roomCode: string) {
  if (typeof window === 'undefined') return null

  try {
    const value = window.sessionStorage.getItem(ROOM_DRAFTS_STORAGE_KEY)
    if (!value) return null

    const drafts = JSON.parse(value) as Record<string, unknown>
    const draft = drafts[roomCode]

    return isRoomDraft(draft) ? draft : null
  } catch {
    return null
  }
}

function getRoomDraft(roomCode: string) {
  const storedRoom = getStoredRoomDraft(roomCode)
  if (storedRoom) return storedRoom

  const recommendedRoom = recommendedRooms.find(item => item.room.code === roomCode)?.room
  if (recommendedRoom) return { ...recommendedRoom }

  return {
    code: roomCode || 'pool-demo-room',
    name: roomCode ? `听歌房 · ${roomCode}` : 'POOL 演示听歌房',
    tag: '随便听听',
    isPasswordProtected: false,
    maxMembers: 8,
    maxStageMembers: 6,
  }
}

export function getRoomDemo(roomCode: string): RoomDemoData {
  const room = getRoomDraft(roomCode)
  const isCurrentUserHost = Boolean(getStoredRoomDraft(roomCode))
  const myPlaylist = cloneSongs(mockMyLikedSongs)
  const currentUser = { ...currentUserTemplate, playlist: cloneSongs(myPlaylist) }
  const stageMembers = cloneStageMembers(stageMembersTemplate)
  const firstStageMember = stageMembers[0]
  const activeSong = firstStageMember?.playlist[0] ?? null

  // The displayed first program has already left its owner's pending queue.
  // This mirrors advanceRoomPlayback: every list head is the next song to play.
  if (firstStageMember && activeSong) {
    stageMembers[0] = {
      ...firstStageMember,
      playlist: [...firstStageMember.playlist.slice(1), { ...activeSong }],
    }
  }

  return {
    room,
    stageMembers,
    currentUser,
    isCurrentUserHost,
    myPlaylist,
    player: getDefaultPlayerState(activeSong),
    chatMessages: getDefaultChatMessages(),
  }
}

export { mockSearchSongs }
