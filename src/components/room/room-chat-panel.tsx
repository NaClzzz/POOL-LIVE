'use client'

import { SendOutlined } from '@ant-design/icons'
import { Alert, Input } from 'antd'
import { useState } from 'react'

import type { RoomRealtimeChatMessage } from '@/types/room'

// 用于房间页右侧常驻聊天栏展示消息、发送状态和服务端错误。
type RoomChatPanelProps = {
  messages: RoomRealtimeChatMessage[]
  currentUserId?: string
  error?: string | null
  onSend: (content: string) => Promise<boolean>
}

function formatMessageTime(createdAt: string) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function RoomChatPanel({ messages, currentUserId, error, onSend }: RoomChatPanelProps) {
  const [content, setContent] = useState('')
  const [isSending, setIsSending] = useState(false)

  async function handleSend() {
    const nextContent = content.trim()
    if (!nextContent || isSending) return

    setIsSending(true)

    try {
      const isSent = await onSend(nextContent)
      if (isSent) setContent('')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <aside
      aria-label="房间聊天"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-[#dfe4e7] bg-white"
    >
      <header className="flex h-16 shrink-0 items-center border-b border-[#dfe4e7] px-5">
        <div>
          <p className="m-0 text-xs font-semibold tracking-[0.16em] text-[#1e88e5]">ROOM CHAT</p>
          <h2 className="m-0 mt-1 text-lg font-semibold text-[#222a30]">房间聊天</h2>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {messages.length === 0 ? (
          <p className="m-0 text-center text-sm text-[#71808a]">还没有消息，说点什么吧。</p>
        ) : null}
        {messages.map(message => {
          const isMine = message.senderId === currentUserId

          return (
            <article key={message.id} className={isMine ? 'text-right' : ''}>
              <div
                className={`mb-1 flex items-center gap-2 text-xs text-[#71808a] ${
                  isMine ? 'justify-end' : ''
                }`}
              >
                <span>{message.senderName}</span>
                <span>{formatMessageTime(message.createdAt)}</span>
              </div>
              <p
                className={`m-0 inline-block max-w-[260px] rounded-[8px] px-3 py-2 text-left text-sm leading-6 ${
                  isMine ? 'bg-[#eaf6ff] text-[#1e88e5]' : 'bg-[#f4f6f7] text-[#34454f]'
                }`}
              >
                {message.content}
              </p>
            </article>
          )
        })}
      </div>

      <div className="shrink-0 border-t border-[#dfe4e7] p-4">
        {error ? <Alert className="mb-3" type="error" showIcon message={error} /> : null}
        <Input
          value={content}
          maxLength={120}
          disabled={isSending}
          placeholder="说点什么…"
          suffix={
            <button
              type="button"
              disabled={!content.trim() || isSending}
              aria-label="发送消息"
              onClick={() => void handleSend()}
              className="text-[#1e88e5] disabled:cursor-not-allowed disabled:text-[#c3cbd0]"
            >
              <SendOutlined />
            </button>
          }
          onChange={event => setContent(event.target.value)}
          onPressEnter={() => void handleSend()}
        />
      </div>
    </aside>
  )
}
