import type { PollingStatus, SettingsStatus } from '../hooks/useNotifications'
import type { Chat, ChatMessage } from '../types'
import { formatTime } from '../utils/format'
import { Avatar } from './Avatar'

interface Props {
  chats: Chat[]
  messages: Record<string, ChatMessage[]>
  activeChatId: string | null
  polling: PollingStatus
  settings: SettingsStatus
  fixState: { busy: boolean; note?: string }
  onEnableReceiving: () => void
  onSelect: (chatId: string) => void
  onNewChat: () => void
  onLogout: () => void
}

const MESSENGERS: Record<string, string> = { max: 'MAX', telegram: 'Telegram', whatsapp: 'WhatsApp' }

/** Статус показываем только когда пользователю есть что знать; в штатном режиме строки нет. */
function pollingLabel(p: PollingStatus): string | null {
  if (p.state === 'standby') return 'Сообщения принимаются в другой открытой вкладке'
  if (p.state === 'error') return `Нет связи для приёма сообщений: ${p.error ?? ''} Повторяем…`
  return null
}

export function Sidebar({
  chats,
  messages,
  activeChatId,
  polling,
  settings,
  fixState,
  onEnableReceiving,
  onSelect,
  onNewChat,
  onLogout,
}: Props) {
  const messenger = settings.typeInstance
    ? (MESSENGERS[settings.typeInstance] ?? settings.typeInstance)
    : null
  return (
    <aside className="sidebar">
      <header className="sidebar__header">
        <div>
          <h2>Чаты</h2>
          {messenger && <div className="sidebar__subtitle">{messenger} · GREEN-API</div>}
        </div>
        <button className="icon-btn" onClick={onNewChat} title="Новый чат" aria-label="Новый чат">
          +
        </button>
      </header>
      <ul className="chat-list">
        {chats.length === 0 && <li className="chat-list__empty">Чатов пока нет. Нажмите «+»</li>}
        {chats.map((chat) => {
          const last = messages[chat.id]?.at(-1)
          return (
            <li key={chat.id}>
              <button
                className={`chat-item${chat.id === activeChatId ? ' chat-item--active' : ''}`}
                onClick={() => onSelect(chat.id)}
              >
                <Avatar name={chat.title} seed={chat.id} />
                <div className="chat-item__body">
                  <div className="chat-item__row">
                    <span className="chat-item__title">{chat.title}</span>
                    {last && <span className="chat-item__time">{formatTime(last.timestamp)}</span>}
                  </div>
                  <div className="chat-item__row">
                    <span className="chat-item__preview">
                      {last
                        ? `${last.direction === 'out' ? 'Вы: ' : ''}${last.text}`
                        : 'Нет сообщений'}
                    </span>
                    {chat.unread > 0 && <span className="badge">{chat.unread}</span>}
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
      {settings.problem && (
        <div className="settings-warning" role="alert">
          <p>{settings.problem}. Ответы собеседников не будут приходить.</p>
          {fixState.note ? (
            <p className="settings-warning__note">{fixState.note}</p>
          ) : (
            <button className="primary" onClick={onEnableReceiving} disabled={fixState.busy}>
              {fixState.busy ? 'Сохраняем…' : 'Включить приём входящих'}
            </button>
          )}
        </div>
      )}
      <footer className="sidebar__footer">
        <div className={`polling polling--${polling.state}`} aria-live="polite">
          {pollingLabel(polling)}
        </div>
        <button className="link-btn" onClick={onLogout}>
          Выйти
        </button>
      </footer>
    </aside>
  )
}
