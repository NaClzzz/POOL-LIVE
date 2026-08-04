import 'server-only'

import { betterAuth } from 'better-auth'

import { database } from '@/lib/database'

export const auth = betterAuth({
  database,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
})
