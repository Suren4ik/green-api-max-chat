import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { Chat, ChatMessage } from '../types'
import { formatTime } from '../utils/format'
import { Avatar } from './Avatar'

const MAX_LENGTH = 4000

interface Props {
  chat: Chat
  messages: ChatMessage[]
  onSend: (text: string) => void
  onRetry: (message: ChatMessage) => void
  onBack: () => void
}

const STATUS_ICON = { sending: '🕓', sent: '✓', error: '⚠' } as const

export function ChatWindow({ chat, messages, onSend, onRetry, onBack }: Props) {
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, chat.id])

  function send(e?: FormEvent) {
    e?.preventDefault()
    const value = text.trim()
    if (!value) return
    onSend(value)
    setText('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <section className="chat">
      <header className="chat__header">
        <button className="icon-btn chat__back" onClick={onBack} aria-label="Назад">
          ←
        </button>
        <Avatar name={chat.title} seed={chat.id} />
        <div className="chat__title">{chat.title}</div>
      </header>

      <div className="chat__messages">
        {messages.map((m) => (
          <div key={m.id} className={`bubble bubble--${m.direction}`}>
            <span className="bubble__text">{m.text}</span>
            <span className="bubble__meta">
              {formatTime(m.timestamp)}
              {m.direction === 'out' && m.status && (
                <span className={`status status--${m.status}`}>{STATUS_ICON[m.status]}</span>
              )}
            </span>
            {m.status === 'error' && (
              <button className="link-btn" onClick={() => onRetry(m)}>
                Не отправлено. Повторить
              </button>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={send}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Сообщение"
          rows={1}
          maxLength={MAX_LENGTH}
          autoFocus
        />
        <button className="send-btn" disabled={!text.trim()} aria-label="Отправить">
          ➤
        </button>
      </form>
    </section>
  )
}
