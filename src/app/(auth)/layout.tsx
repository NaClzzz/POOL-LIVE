import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getCurrentSession } from '@/lib/auth-session'

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession()

  if (session) redirect('/')

  return (
    <main className="auth-shell">
      <div className="auth-panel">
        <Link href="/" className="mb-9 flex items-center gap-3 text-xl font-semibold tracking-[0.12em] text-[#222a30]">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[#42a5f5] font-display text-2xl font-normal text-white">
            P
          </span>
          POOL
        </Link>
        {children}
      </div>
    </main>
  )
}
