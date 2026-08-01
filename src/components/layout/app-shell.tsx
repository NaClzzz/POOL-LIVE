import type { ReactNode } from 'react'

import { TopNavigation } from '@/components/layout/top-navigation'
import { PlayerBar } from '@/components/player/player-bar'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen min-w-[1180px] bg-[#f6f7f7] pb-28">
      <TopNavigation />
      <main className="pt-16">{children}</main>
      <PlayerBar />
    </div>
  )
}
