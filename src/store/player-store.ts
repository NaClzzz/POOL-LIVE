import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type { PlayerSong } from '@/types/player'

export type PlaybackMode = 'sequential' | 'shuffle'
export type QueueSource = 'search' | 'liked'

type PlayerStore = {
  currentSong: PlayerSong | null
  queue: PlayerSong[]
  baseQueueSnapshot: PlayerSong[]
  queueSource: QueueSource | null
  playbackMode: PlaybackMode
  currentIndex: number
  audioUrl: string | null
  isPlaying: boolean
  isLoadingAudio: boolean
  currentTime: number
  duration: number
  volume: number
  playbackError: string | null
  startQueue: (
    queue: PlayerSong[],
    startIndex: number,
    audioUrl: string,
    source: QueueSource,
    playbackMode: PlaybackMode,
  ) => void
  selectQueueSong: (index: number) => PlayerSong | null
  nextSong: () => PlayerSong | null
  previousSong: () => PlayerSong | null
  removeFromQueue: (index: number) => void
  moveQueueSong: (fromIndex: number, toIndex: number) => PlayerSong | null
  setLocalPlaybackMode: (playbackMode: PlaybackMode) => void
  applyLikedQueueForPlaybackMode: (queue: PlayerSong[], playbackMode: PlaybackMode) => void
  restoreQueue: () => void
  setAudioSource: (audioUrl: string, shouldPlay: boolean) => void
  setIsLoadingAudio: (isLoadingAudio: boolean) => void
  setIsPlaying: (isPlaying: boolean) => void
  setCurrentTime: (currentTime: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number) => void
  setPlaybackError: (message: string | null) => void
}

function getSafeIndex(queue: PlayerSong[], index: number) {
  if (queue.length === 0) return -1

  return Math.min(Math.max(index, 0), queue.length - 1)
}

function getSongIndex(queue: PlayerSong[], songId: number | undefined) {
  if (songId === undefined) return -1

  return queue.findIndex(song => song.id === songId)
}

function moveSong(queue: PlayerSong[], fromIndex: number, toIndex: number) {
  const nextQueue = [...queue]
  const [song] = nextQueue.splice(fromIndex, 1)

  if (!song) return queue

  nextQueue.splice(toIndex, 0, song)
  return nextQueue
}

function shuffleSongs(queue: PlayerSong[]) {
  const shuffledQueue = [...queue]

  for (let index = shuffledQueue.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffledQueue[index], shuffledQueue[swapIndex]] = [
      shuffledQueue[swapIndex],
      shuffledQueue[index],
    ]
  }

  return shuffledQueue
}

function shuffleQueueKeepingCurrentSong(queue: PlayerSong[], currentSongId: number | undefined) {
  const currentSongIndex = getSongIndex(queue, currentSongId)

  if (currentSongIndex < 0) return shuffleSongs(queue)

  const currentSong = queue[currentSongIndex]
  const remainingSongs = queue.filter(song => song.id !== currentSongId)

  return [currentSong, ...shuffleSongs(remainingSongs)]
}

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      currentSong: null,
      queue: [],
      baseQueueSnapshot: [],
      queueSource: null,
      playbackMode: 'sequential',
      currentIndex: -1,
      audioUrl: null,
      isPlaying: false,
      isLoadingAudio: false,
      currentTime: 0,
      duration: 0,
      volume: 0.65,
      playbackError: null,

      startQueue: (queue, startIndex, audioUrl, source, playbackMode) => {
        const baseQueueSnapshot = [...queue]
        const safeStartIndex = getSafeIndex(baseQueueSnapshot, startIndex)
        const selectedSong = safeStartIndex >= 0 ? baseQueueSnapshot[safeStartIndex] : null
        const playbackQueue =
          playbackMode === 'shuffle'
            ? shuffleQueueKeepingCurrentSong(baseQueueSnapshot, selectedSong?.id)
            : baseQueueSnapshot
        const currentIndex = getSongIndex(playbackQueue, selectedSong?.id)
        const currentSong = currentIndex >= 0 ? playbackQueue[currentIndex] : null

        set({
          queue: playbackQueue,
          baseQueueSnapshot,
          queueSource: source,
          playbackMode,
          currentIndex,
          currentSong,
          audioUrl,
          isPlaying: Boolean(currentSong),
          isLoadingAudio: false,
          currentTime: 0,
          duration: currentSong ? currentSong.duration / 1000 : 0,
          playbackError: null,
        })
      },

      selectQueueSong: index => {
        const { queue } = get()

        if (index < 0 || index >= queue.length) return null

        const currentSong = queue[index]
        set({
          currentIndex: index,
          currentSong,
          audioUrl: null,
          isPlaying: false,
          currentTime: 0,
          duration: currentSong.duration / 1000,
          playbackError: null,
        })

        return currentSong
      },

      nextSong: () => {
        const { currentIndex, queue } = get()

        if (queue.length === 0) return null

        const nextIndex = (currentIndex + 1 + queue.length) % queue.length
        return get().selectQueueSong(nextIndex)
      },

      previousSong: () => {
        const { currentIndex, queue } = get()

        if (queue.length === 0 || currentIndex < 0) return null

        const previousIndex = (currentIndex - 1 + queue.length) % queue.length
        return get().selectQueueSong(previousIndex)
      },

      removeFromQueue: index => {
        const { currentSong, queue } = get()

        if (index < 0 || index >= queue.length) return

        const removedSong = queue[index]
        const nextQueue = queue.filter((_, songIndex) => songIndex !== index)
        const removedCurrentSong = removedSong.id === currentSong?.id
        const nextIndex = removedCurrentSong
          ? getSafeIndex(nextQueue, index)
          : getSongIndex(nextQueue, currentSong?.id)
        const nextCurrentSong =
          nextIndex >= 0 ? nextQueue[nextIndex] : removedCurrentSong ? null : currentSong

        set({
          queue: nextQueue,
          currentIndex: nextIndex,
          currentSong: nextCurrentSong,
          audioUrl: removedCurrentSong ? null : get().audioUrl,
          isPlaying: removedCurrentSong ? false : get().isPlaying,
          currentTime: removedCurrentSong ? 0 : get().currentTime,
          duration: nextCurrentSong ? nextCurrentSong.duration / 1000 : 0,
          playbackError: null,
        })
      },

      moveQueueSong: (fromIndex, toIndex) => {
        const { currentSong, queue } = get()

        if (
          fromIndex < 0 ||
          fromIndex >= queue.length ||
          toIndex < 0 ||
          toIndex >= queue.length ||
          fromIndex === toIndex
        ) {
          return null
        }

        const movedSong = queue[fromIndex]
        const nextQueue = moveSong(queue, fromIndex, toIndex)
        const currentIndex = getSongIndex(nextQueue, currentSong?.id)
        const movedCurrentSong = movedSong.id === currentSong?.id

        set({
          queue: nextQueue,
          currentIndex,
        })

        return movedCurrentSong ? movedSong : null
      },

      setLocalPlaybackMode: playbackMode => {
        const { baseQueueSnapshot, currentSong, queue } = get()
        // Older localStorage records were created before baseQueueSnapshot existed.
        // Falling back to the current queue keeps a mode switch from clearing them.
        const sequentialQueue = baseQueueSnapshot.length > 0 ? baseQueueSnapshot : queue
        const nextQueue =
          playbackMode === 'shuffle'
            ? shuffleQueueKeepingCurrentSong(queue, currentSong?.id)
            : [...sequentialQueue]
        const currentIndex = getSongIndex(nextQueue, currentSong?.id)

        set({
          queue: nextQueue,
          baseQueueSnapshot: [...sequentialQueue],
          playbackMode,
          currentIndex,
        })
      },

      applyLikedQueueForPlaybackMode: (queue, playbackMode) => {
        const { currentSong } = get()
        const baseQueueSnapshot = [...queue]
        const currentSongIndex = getSongIndex(baseQueueSnapshot, currentSong?.id)
        const nextQueue =
          playbackMode === 'shuffle'
            ? shuffleQueueKeepingCurrentSong(baseQueueSnapshot, currentSong?.id)
            : baseQueueSnapshot
        const currentIndex =
          currentSongIndex >= 0 ? getSongIndex(nextQueue, currentSong?.id) : -1

        set({
          queue: nextQueue,
          baseQueueSnapshot,
          queueSource: 'liked',
          playbackMode,
          currentIndex,
          currentSong: currentSongIndex >= 0 && currentIndex >= 0 ? nextQueue[currentIndex] : currentSong,
        })
      },

      restoreQueue: () => {
        const { currentIndex, queue } = get()
        const safeIndex = getSafeIndex(queue, currentIndex)
        const currentSong = safeIndex >= 0 ? queue[safeIndex] : null

        set({
          currentIndex: safeIndex,
          currentSong,
          audioUrl: null,
          isPlaying: false,
          isLoadingAudio: false,
          currentTime: 0,
          duration: currentSong ? currentSong.duration / 1000 : 0,
          playbackError: null,
        })
      },

      setAudioSource: (audioUrl, shouldPlay) =>
        set({
          audioUrl,
          isPlaying: shouldPlay,
          currentTime: 0,
          playbackError: null,
        }),

      setIsLoadingAudio: isLoadingAudio => set({ isLoadingAudio }),
      setIsPlaying: isPlaying => set({ isPlaying }),
      setCurrentTime: currentTime => set({ currentTime }),
      setDuration: duration => set({ duration }),
      setVolume: volume => set({ volume: Math.min(Math.max(volume, 0), 1) }),
      setPlaybackError: playbackError => set({ playbackError }),
    }),
    {
      name: 'music-player-queue',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        queue: state.queue,
        baseQueueSnapshot: state.baseQueueSnapshot,
        queueSource: state.queueSource,
        playbackMode: state.playbackMode,
        currentIndex: state.currentIndex,
        volume: state.volume,
      }),
      skipHydration: true,
    },
  ),
)
