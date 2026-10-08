import { useState } from 'react'
import { ApiError, sendMessage, setSettings } from '../api/greenApi'
import { useNotifications } from '../hooks/useNotifications'
import { useChatStore } from '../store/chatStore'
import type { ChatMessage, Credentials } from '../types'
import { ChatWindow } from './ChatWindow'
import { NewChatDialog } from './NewChatDialog'
import { Sidebar } from './Sidebar'

interface Props {
  credentials: Credentials
  onLogout: (error?: string) => void
}

export function ChatApp({ credentials, onLogout }: Props) {
  const [state, dispatch] = useChatStore(credentials.idInstance)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [fixState, setFixState] = useState<{ busy: boolean; note?: string }>({ busy: false })

  const { polling, settings, recheckSettings } = useNotifications(credentials, dispatch, (message) =>
    onLogout(message),
  )

  const activeChat = state.chats.find((c) => c.id === state.activeChatId) ?? null

  async function deliver(chatId: string, localId: string, text: string) {
    try {
      const { idMessage } = await sendMessage(credentials, chatId, text)
      dispatch({ type: 'messageStatus', chatId, id: localId, status: 'sent', serverId: idMessage })
    } catch (e) {
      console.warn('[green-api] sendMessage failed', e)
      dispatch({ type: 'messageStatus', chatId, id: localId, status: 'error' })
    }
  }

  function send(text: string) {
    if (!activeChat) return
    const message: ChatMessage = {
      id: `local-${crypto.randomUUID()}`,
      chatId: activeChat.id,
      text,
      timestamp: Date.now(),
      direction: 'out',
      status: 'sending',
    }
    dispatch({ type: 'messageAdded', message })
    void deliver(activeChat.id, message.id, text)
  }

  function retry(message: ChatMessage) {
    dispatch({ type: 'messageStatus', chatId: message.chatId, id: message.id, status: 'sending' })
    void deliver(message.chatId, message.id, message.text)
  }

  async function enableReceiving() {
    setFixState({ busy: true })
    try {
      await setSettings(credentials, { incomingWebhook: 'yes', webhookUrl: '' })
      setFixState({
        busy: false,
        note: 'Настройки сохранены. GREEN-API применяет их в течение 5 минут (инстанс перезапустится)',
      })
      recheckSettings()
    } catch (e) {
      setFixState({
        busy: false,
        note: e instanceof ApiError ? e.message : 'Не удалось сохранить настройки',
      })
    }
  }

  return (
    <div className={`app${activeChat ? ' app--chat-open' : ''}`}>
      <Sidebar
        chats={state.chats}
        messages={state.messages}
        activeChatId={state.activeChatId}
        polling={polling}
        settings={settings}
        fixState={fixState}
        onEnableReceiving={enableReceiving}
        onSelect={(chatId) => dispatch({ type: 'chatSelected', chatId })}
        onNewChat={() => setDialogOpen(true)}
        onLogout={() => onLogout()}
      />
      {activeChat ? (
        <ChatWindow
          key={activeChat.id}
          chat={activeChat}
          messages={state.messages[activeChat.id] ?? []}
          onSend={send}
          onRetry={retry}
          onBack={() => dispatch({ type: 'chatSelected', chatId: null })}
        />
      ) : (
        <section className="chat chat--empty">Выберите чат или создайте новый</section>
      )}
      {dialogOpen && (
        <NewChatDialog
          credentials={credentials}
          onCreate={(chat) => {
            dispatch({ type: 'chatOpened', chat })
            setDialogOpen(false)
          }}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  )
}
