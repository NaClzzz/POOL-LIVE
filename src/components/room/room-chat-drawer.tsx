'use client'

import { CloseOutlined, SendOutlined } from '@ant-design/icons'
import { Input } from 'antd'
import { useEffect, useState } from 'react'

import type { RoomChatMessage } from '@/types/room'

type RoomChatDrawerProps = {
  open: boolean
  messages: RoomChatMessage[]
  onClose: () => void
  onSend: (content: string) => void
}

export function RoomChatDrawer({ open, messages, onClose, onSend }: RoomChatDrawerProps) {
  const [content, setContent] = useState('')
  const [shouldRender, setShouldRender] = useState(open)
  const [isVisible, setIsVisible] = useState(open)

  useEffect(() => {
    let animationFrame: number | undefined
    let revealFrame: number | undefined
    let closeTimeout: number | undefined

    if (open) {
      animationFrame = window.requestAnimationFrame(() => {
        setShouldRender(true)
        revealFrame = window.requestAnimationFrame(() => setIsVisible(true))
      })
    } else {
      animationFrame = window.requestAnimationFrame(() => setIsVisible(false))
      closeTimeout = window.setTimeout(() => setShouldRender(false), 260)
    }

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      if (revealFrame) window.cancelAnimationFrame(revealFrame)
      if (closeTimeout) window.clearTimeout(closeTimeout)
    }
  }, [open])

  function handleSend() {
    if (!content.trim()) return

    onSend(content)
    setContent('')
  }

  if (!shouldRender) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭聊天"
        className={`absolute inset-0 bg-[#222a30]/20 transition-opacity duration-[260ms] ease-in-out ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-chat-drawer-title"
        className={`absolute bottom-0 right-0 top-0 flex w-[420px] flex-col border-l border-[#dfe4e7] bg-white transition-transform duration-[260ms] ease-in-out ${
          isVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#dfe4e7] px-6">
          <div>
            <p className="m-0 text-xs font-semibold tracking-[0.16em] text-[#1e88e5]">ROOM CHAT</p>
            <h2 id="room-chat-drawer-title" className="m-0 mt-1 text-lg font-semibold text-[#222a30]">
              房间聊天
            </h2>
          </div>
          <button
            type="button"
            aria-label="关闭聊天"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-lg text-[#71808a] hover:bg-[#f0f7fc] hover:text-[#222a30]"
          >
            <CloseOutlined />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {messages.map(message => (
            <article key={message.id} className={message.isMine ? 'text-right' : ''}>
              <div className={`mb-1 flex items-center gap-2 text-xs text-[#71808a] ${message.isMine ? 'justify-end' : ''}`}>
                <span>{message.senderName}</span>
                <span>{message.sentAt}</span>
              </div>
              <p
                className={`m-0 inline-block max-w-[290px] rounded-[8px] px-3 py-2 text-left text-sm leading-6 ${
                  message.isMine ? 'bg-[#eaf6ff] text-[#1e88e5]' : 'bg-[#f4f6f7] text-[#34454f]'
                }`}
              >
                {message.content}
              </p>
            </article>
          ))}
        </div>

        <div className="shrink-0 border-t border-[#dfe4e7] p-4">
          <Input
            value={content}
            maxLength={120}
            placeholder="说点什么…"
            suffix={
              <button
                type="button"
                disabled={!content.trim()}
                aria-label="发送消息"
                onClick={handleSend}
                className="text-[#1e88e5] disabled:cursor-not-allowed disabled:text-[#c3cbd0]"
              >
                <SendOutlined />
              </button>
            }
            onChange={event => setContent(event.target.value)}
            onPressEnter={handleSend}
          />
        </div>
      </aside>
    </div>
  )
}
