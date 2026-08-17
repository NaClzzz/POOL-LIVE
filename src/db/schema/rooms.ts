import { sql } from 'drizzle-orm'
import {
  check,
  bigint,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  integer,
  varchar,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { user } from './legacy'

export const rooms = pgTable(
  'rooms',
  {
    // 由后端生成，例如 room_xxx
    id: text('id').primaryKey(),

    // 分享给其他人的房间号，例如 pool-ab12cd
    code: varchar('code', { length: 32 }).notNull().unique(),

    name: varchar('name', { length: 20 }).notNull(),
    tag: varchar('tag', { length: 12 }).notNull(),

    // null 代表公开房；有值代表密码房，只保存哈希
    passwordHash: text('password_hash'),

    // 这里引用已有 Better Auth 的 user.id
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    maxMembers: smallint('max_members').notNull(),
    maxStageMembers: smallint('max_stage_members').notNull(),

    // Socket 服务维护这个在线人数
    currentMemberCount: smallint('current_member_count').notNull().default(0),

    lastActiveAt: timestamp('last_active_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),

    // 空房的清理时间；创建后 30 分钟内没人进入也会过期
    emptyExpiresAt: timestamp('empty_expires_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .default(sql`now() + interval '30 minutes'`),

    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  table => [
    index('rooms_last_active_index').on(table.lastActiveAt),

    check('rooms_name_length_check', sql`char_length(trim(${table.name})) between 2 and 20`),

    check('rooms_tag_length_check', sql`char_length(trim(${table.tag})) between 2 and 12`),

    check('rooms_max_members_check', sql`${table.maxMembers} between 2 and 50`),

    check('rooms_max_stage_members_check', sql`${table.maxStageMembers} between 1 and 30`),

    check(
      'rooms_current_member_count_check',
      sql`${table.currentMemberCount} between 0 and ${table.maxMembers}`,
    ),
  ],
)

export const roomMembers = pgTable(
  'room_members',
  {
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),

    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // 这次在线从什么时候开始
    joinedAt: timestamp('joined_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),

    // null 表示当前仍在线
    leftAt: timestamp('left_at', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  table => [
    primaryKey({
      columns: [table.roomId, table.userId],
      name: 'room_members_pkey',
    }),

    index('room_members_room_left_joined_index').on(table.roomId, table.leftAt, table.joinedAt),

    uniqueIndex('room_members_one_active_room_per_user')
      .on(table.userId)
      .where(sql`${table.leftAt} is null`),
  ],
)

export const roomMessages = pgTable(
  'room_messages',
  {
    // 由服务端生成，例如 message_xxx
    id: text('id').primaryKey(),

    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),

    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    content: varchar('content', { length: 120 }).notNull(),

    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  table => [
    index('room_messages_room_created_index').on(table.roomId, table.createdAt),

    check(
      'room_messages_content_length_check',
      sql`char_length(trim(${table.content})) between 1 and 120`,
    ),
  ],
)

// 用于保存用户跨房间共用的上台歌单；它与喜欢列表和个人播放器队列相互独立。
export const userRoomPlaylistItems = pgTable(
  'user_room_playlist_items',
  {
    id: text('id').primaryKey().notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    songId: bigint('song_id', { mode: 'number' }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    artists: varchar('artists', { length: 240 }).notNull(),
    albumName: varchar('album_name', { length: 160 }).notNull(),
    coverUrl: text('cover_url'),
    durationMs: integer('duration_ms').notNull().default(0),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('user_room_playlist_items_user_song_unique').on(table.userId, table.songId),
    index('user_room_playlist_items_user_position_index').on(table.userId, table.position),
    check('user_room_playlist_items_song_id_check', sql`${table.songId} > 0`),
    check('user_room_playlist_items_duration_check', sql`${table.durationMs} >= 0`),
    check('user_room_playlist_items_position_check', sql`${table.position} >= 0`),
  ],
)

// 用于保存每个房间的当前节目和服务端时间轴，客户端只消费该状态。
export const roomPlaybackStates = pgTable(
  'room_playback_states',
  {
    roomId: text('room_id')
      .primaryKey()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    activeStageIndex: integer('active_stage_index').notNull().default(-1),
    activeMemberId: text('active_member_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    currentItemId: text('current_item_id'),
    currentSongId: bigint('current_song_id', { mode: 'number' }),
    currentSongName: varchar('current_song_name', { length: 160 }),
    currentSongArtists: varchar('current_song_artists', { length: 240 }),
    currentSongAlbumName: varchar('current_song_album_name', { length: 160 }),
    currentSongCoverUrl: text('current_song_cover_url'),
    currentSongDurationMs: integer('current_song_duration_ms'),
    status: varchar('status', { length: 16 }).notNull().default('idle'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    startOffsetMs: integer('start_offset_ms').notNull().default(0),
    version: integer('version').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  table => [
    check('room_playback_states_status_check', sql`${table.status} in ('idle', 'playing')`),
    check('room_playback_states_start_offset_check', sql`${table.startOffsetMs} >= 0`),
    check('room_playback_states_version_check', sql`${table.version} >= 0`),
  ],
)
