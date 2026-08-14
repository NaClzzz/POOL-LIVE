'use client'

import Link from 'next/link'
import { useRef, useEffect } from 'react'

const cards = [
  {
    href: '/search',
    label: '搜索',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-5 w-5"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    ),
  },
  {
    href: '/library',
    label: '喜欢',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-5 w-5"
      >
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    ),
  },
  {
    href: '/rooms',
    label: '一起听',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-5 w-5"
      >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/profile',
    label: '个人中心',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-5 w-5"
      >
        <circle cx="12" cy="8" r="5" />
        <path d="M20 21a8 8 0 1 0-16 0" />
      </svg>
    ),
  },
]

export default function HomePage() {
  const poolRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const el = poolRef.current
    if (!el) return

    function handleMouseMove(event: MouseEvent) {
      const x = (event.clientX / window.innerWidth - 0.5) * -20
      const y = (event.clientY / window.innerHeight - 0.5) * -20
      el!.style.transform = `translate(${x}px, ${y}px)`
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  return (
    <main className="desktop-page flex flex-col items-center justify-center">
      <h1
        ref={poolRef}
        className="font-display text-[280px] leading-none tracking-[0.06em] text-[#42a5f5] select-none transition-[transform] duration-200 ease-out"
      >
        POOL
      </h1>
      <div className="mt-24 grid grid-cols-4 gap-4">
        {cards.map(({ href, icon, label }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-2 rounded-xl border border-[#dfe4e7] bg-white px-6 py-4 text-[#52616a] transition-all hover:border-[#42a5f5] hover:text-[#1e88e5] hover:shadow-sm"
          >
            {icon}
            <span className="text-sm tracking-[0.12em]">{label}</span>
          </Link>
        ))}
      </div>
    </main>
  )
}
