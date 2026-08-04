import { createAuthClient } from 'better-auth/react'

// 使用相对地址调用 /api/auth，开发与生产环境都会自动使用当前网站域名。
export const authClient = createAuthClient()

export const { signIn, signOut, signUp, updateUser, useSession } = authClient
