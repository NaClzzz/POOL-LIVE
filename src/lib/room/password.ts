import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

export const ROOM_PASSWORD_MIN_LENGTH = 6
export const ROOM_PASSWORD_MAX_LENGTH = 64

export async function hashRoomPassword(password: string) {
  const salt = randomBytes(16)
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer

  return `scrypt$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`
}

export async function verifyRoomPassword(password: string, storedHash: string) {
  const [algorithm, encodedSalt, encodedHash] = storedHash.split('$')

  if (algorithm !== 'scrypt' || !encodedSalt || !encodedHash) return false

  try {
    const salt = Buffer.from(encodedSalt, 'base64url')
    const expectedKey = Buffer.from(encodedHash, 'base64url')
    const actualKey = (await scrypt(password, salt, expectedKey.length)) as Buffer

    return actualKey.length === expectedKey.length && timingSafeEqual(actualKey, expectedKey)
  } catch {
    return false
  }
}
