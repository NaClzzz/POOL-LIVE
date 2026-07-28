import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type { PlayerSong } from '@/types/player'

type PlayerStore = {
  currentSong: PlayerSong | null
  queue: PlayerSong[]
  currentIndex: number
  audioUrl: string | null
  isPlaying: boolean
  isLoadingAudio: boolean
  currentTime: number
  duration: number
  volume: number
  playbackError: string | null
  startQueue: (queue: PlayerSong[], startIndex: number, audioUrl: string) => void
  selectQueueSong: (index: number) => PlayerSong | null
  nextSong: () => PlayerSong | null
  previousSong: () => PlayerSong | null
  removeFromQueue: (index: number) => void
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

export const usePlayerStore = create<PlayerStore>()(
  persist(
    (set, get) => ({
      currentSong: null,
      queue: [],
      currentIndex: -1,
      audioUrl: null,
      isPlaying: false,
      isLoadingAudio: false,
      currentTime: 0,
      duration: 0,
      volume: 0.65,
      playbackError: null,

      startQueue: (queue, startIndex, audioUrl) => {
        const currentIndex = getSafeIndex(queue, startIndex)
        const currentSong = currentIndex >= 0 ? queue[currentIndex] : null

        set({
          queue,
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
        const nextIndex = currentIndex + 1

        if (nextIndex >= queue.length) return null

        return get().selectQueueSong(nextIndex)
      },

      previousSong: () => {
        const { currentIndex } = get()
        const previousIndex = currentIndex - 1

        if (previousIndex < 0) return null

        return get().selectQueueSong(previousIndex)
      },

      removeFromQueue: index => {
        const { currentIndex, queue } = get()

        if (index < 0 || index >= queue.length) return

        const nextQueue = queue.filter((_, songIndex) => songIndex !== index)
        const nextIndex =
          index < currentIndex
            ? currentIndex - 1
            : getSafeIndex(nextQueue, currentIndex)

        const removedCurrentSong = index === currentIndex
        const currentSong = removedCurrentSong ? nextQueue[nextIndex] ?? null : get().currentSong

        set({
          queue: nextQueue,
          currentIndex: currentSong ? nextIndex : -1,
          currentSong,
          audioUrl: removedCurrentSong ? null : get().audioUrl,
          isPlaying: removedCurrentSong ? false : get().isPlaying,
          currentTime: removedCurrentSong ? 0 : get().currentTime,
          duration: currentSong ? currentSong.duration / 1000 : 0,
          playbackError: null,
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
        currentIndex: state.currentIndex,
        volume: state.volume,
      }),
      skipHydration: true,
    },
  ),
)
