import 'server-only'

import { randomBytes } from 'node:crypto'

import {
  hashRoomPassword,
  ROOM_PASSWORD_MAX_LENGTH,
  ROOM_PASSWORD_MIN_LENGTH,
  verifyRoomPassword,
} from './password'

const ROOM_NAME_MIN_LENGTH = 2
const ROOM_NAME_MAX_LENGTH = 20
const ROOM_TAG_MIN_LENGTH = 2
const ROOM_TAG_MAX_LENGTH = 12

export type CreateRoomInput = {
  name: string
  tag: string
  password: string | null
  maxMembers: number
  maxStageMembers: number
}

export class RoomValidationError extends Error {}

function getRequiredText(value: unknown, fieldName: string, minLength: number, maxLength: number) {
  if (typeof value !== 'string') {
    throw new RoomValidationError(`${fieldName}格式不正确。`)
  }

  const text = value.trim()

  if (text.length < minLength || text.length > maxLength) {
    throw new RoomValidationError(`${fieldName}长度应为 ${minLength} 到 ${maxLength} 个字符。`)
  }

  return text
}

function getIntegerInRange(value: unknown, fieldName: string, min: number, max: number) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new RoomValidationError(`${fieldName}应为 ${min} 到 ${max} 之间的整数。`)
  }

  return value as number
}

function getOptionalPassword(value: unknown) {
  if (value === undefined || value === null || value === '') return null

  if (typeof value !== 'string') {
    throw new RoomValidationError('房间密码格式不正确。')
  }

  // 密码不能 trim：首尾空格若由用户设置，也必须作为密码的一部分参与校验。
  if (value.length < ROOM_PASSWORD_MIN_LENGTH || value.length > ROOM_PASSWORD_MAX_LENGTH) {
    throw new RoomValidationError(
      `房间密码长度应为 ${ROOM_PASSWORD_MIN_LENGTH} 到 ${ROOM_PASSWORD_MAX_LENGTH} 个字符。`,
    )
  }

  return value
}

export function parseCreateRoomInput(value: unknown): CreateRoomInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RoomValidationError('请求数据格式不正确。')
  }

  const input = value as Record<string, unknown>

  return {
    name: getRequiredText(input.name, '房间名称', ROOM_NAME_MIN_LENGTH, ROOM_NAME_MAX_LENGTH),
    tag: getRequiredText(input.tag, '房间标签', ROOM_TAG_MIN_LENGTH, ROOM_TAG_MAX_LENGTH),
    password: getOptionalPassword(input.password),
    maxMembers: getIntegerInRange(input.maxMembers, '最大人数', 2, 50),
    maxStageMembers: getIntegerInRange(input.maxStageMembers, '最大上台人数', 1, 30),
  }
}

export function createRoomId() {
  return `room_${randomBytes(12).toString('base64url')}`
}

export function createRoomCode() {
  return `pool-${randomBytes(4).toString('hex')}`
}

export { hashRoomPassword, verifyRoomPassword }
