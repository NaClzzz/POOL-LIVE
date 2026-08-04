import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

import { AppShell } from '@/components/layout/app-shell'
import { getCurrentSession } from '@/lib/auth-session'

export default async function MainAppLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession()

  if (!session) redirect('/login')

  return <AppShell>{children}</AppShell>
}
