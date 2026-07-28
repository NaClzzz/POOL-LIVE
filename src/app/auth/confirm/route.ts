import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

import { getSupabaseConfig } from '@/lib/supabase/config'

function getSafeNextPath(value: string | null) {
  if (value?.startsWith('/') && !value.startsWith('//')) return value

  return '/'
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const nextPath = getSafeNextPath(requestUrl.searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(
      new URL('/login?error=邮箱验证链接无效或已过期。', requestUrl.origin),
    )
  }

  let response = NextResponse.redirect(new URL(nextPath, requestUrl.origin))
  const { url, publishableKey } = getSupabaseConfig()
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.redirect(new URL(nextPath, requestUrl.origin))
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })

  const {
    data: { user },
    error,
  } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !user) {
    return NextResponse.redirect(
      new URL('/login?error=邮箱验证失败，请重新注册或登录。', requestUrl.origin),
    )
  }

  const displayName =
    typeof user.user_metadata.display_name === 'string'
      ? user.user_metadata.display_name
      : user.email?.split('@')[0] ?? '新用户'

  await supabase.from('profiles').upsert(
    {
      id: user.id,
      display_name: displayName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  return response
}
