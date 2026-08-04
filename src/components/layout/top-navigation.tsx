'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const items = [
  { label: '首页', href: '/' },
  { label: '搜索', href: '/search' },
  { label: '喜欢', href: '/library' },
  { label: '一起听', href: '/rooms' },
  { label: '个人中心', href: '/profile' },
]

export function TopNavigation() {
  const pathname = usePathname()

  function isActive(href: string) {
    return href === '/' ? pathname === '/' : pathname.startsWith(href)
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-40 h-16 border-b border-[#dfe4e7] bg-white">
      <div className="mx-auto flex h-full w-[1180px] items-center justify-between px-12">
        <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[0.12em] text-[#222a30]">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#42a5f5] font-display text-base font-normal text-white">
            P
          </span>
          POOL
        </Link>
        <nav aria-label="主导航" className="flex h-full items-center gap-8">
          {items.map(item => {
            if (!item.href) {
              return (
                <span
                  key={item.label}
                  aria-disabled="true"
                  className="flex h-full cursor-not-allowed items-center border-b-2 border-transparent px-1 text-sm font-medium tracking-[0.12em] text-[#b0bac0]"
                >
                  {item.label}
                </span>
              )
            }

            const active = isActive(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-full items-center border-b-2 px-1 text-sm font-medium tracking-[0.12em] ${
                  active
                    ? 'border-[#42a5f5] text-[#1e88e5]'
                    : 'border-transparent text-[#66747d] hover:border-[#b9e1ff] hover:text-[#222a30]'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
