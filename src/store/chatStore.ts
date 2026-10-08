import { useEffect, useReducer } from 'react'
import type { Chat, ChatMessage, MessageStatus } from '../types'

/** Общая для всех вкладок часть состояния — хранится в localStorage. */
export interface PersistedState {
  chats: Chat[]
  messages: Record<string, ChatMessage[]>
}

export interface ChatState extends PersistedState {
  /** открытый чат — свой у каждой вкладки, не синхронизируется */
  activeChatId: string | null
}

export type ChatAction =
  | { type: 'chatOpened'; chat: Chat }
  | { type: 'chatSelected'; chatId: string | null }
  | { type: 'messageAdded'; message: ChatMessage; title?: string; phone?: string }
  | { type: 'messageStatus'; chatId: string; id: string; status: MessageStatus; serverId?: string }
  | { type: 'synced'; remote: PersistedState }

const emptyPersisted: PersistedState = { chats: [], messages: {} }

// Порядок детерминирован (с тай-брейком по id): иначе вкладки могли бы бесконечно
// перезаписывать друг другу одно и то же состояние в другом порядке.
function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => b.lastActivity - a.lastActivity || a.id.localeCompare(b.id))
}

const STATUS_RANK: Record<MessageStatus, number> = { sending: 0, error: 1, sent: 2 }

function pickMessage(a: ChatMessage, b: ChatMessage): ChatMessage {
  if (!a.status || !b.status) return b
  return STATUS_RANK[b.status] >= STATUS_RANK[a.status] ? b : a
}

/**
 * Слияние состояния другой вкладки с локальным. Сообщения и чаты только добавляются,
 * поэтому объединение по id не теряет данные при одновременной записи из двух вкладок.
 */
export function mergeState(local: PersistedState, remote: PersistedState): PersistedState {
  const chats = new Map(local.chats.map((c) => [c.id, c]))
  for (const r of remote.chats) {
    const l = chats.get(r.id)
    chats.set(r.id, l ? { ...r, lastActivity: Math.max(l.lastActivity, r.lastActivity) } : r)
  }
  const messages: Record<string, ChatMessage[]> = {}
  for (const chatId of new Set([...Object.keys(local.messages), ...Object.keys(remote.messages)])) {
    const byId = new Map((local.messages[chatId] ?? []).map((m) => [m.id, m]))
    for (const r of remote.messages[chatId] ?? []) {
      const l = byId.get(r.id)
      byId.set(r.id, l ? pickMessage(l, r) : r)
    }
    messages[chatId] = [...byId.values()].sort(
      (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id),
    )
  }
  return { chats: sortChats([...chats.values()]), messages }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'chatOpened': {
      const exists = state.chats.some((c) => c.id === action.chat.id)
      return {
        ...state,
        chats: exists ? state.chats : sortChats([...state.chats, action.chat]),
        activeChatId: action.chat.id,
      }
    }
    case 'chatSelected':
      return {
        ...state,
        activeChatId: action.chatId,
        chats: state.chats.map((c) => (c.id === action.chatId ? { ...c, unread: 0 } : c)),
      }
    case 'messageAdded': {
      // Если chatId входящего не совпал с созданным по номеру чатом, ищем чат по номеру отправителя.
      const byPhone =
        action.phone && !state.chats.some((c) => c.id === action.message.chatId)
          ? state.chats.find((c) => c.phone === action.phone)
          : undefined
      const message = byPhone ? { ...action.message, chatId: byPhone.id } : action.message
      const list = state.messages[message.chatId] ?? []
      if (list.some((m) => m.id === message.id)) return state // дубль уведомления
      const isActive = state.activeChatId === message.chatId
      const known = state.chats.some((c) => c.id === message.chatId)
      const bump = (c: Chat): Chat => ({
        ...c,
        lastActivity: Math.max(c.lastActivity, message.timestamp),
        unread: message.direction === 'in' && !isActive ? c.unread + 1 : c.unread,
      })
      const chats = known
        ? state.chats.map((c) => (c.id === message.chatId ? bump(c) : c))
        : [
            ...state.chats,
            bump({
              id: message.chatId,
              title: action.title || message.chatId,
              lastActivity: message.timestamp,
              unread: 0,
            }),
          ]
      return {
        ...state,
        chats: sortChats(chats),
        messages: { ...state.messages, [message.chatId]: [...list, message] },
      }
    }
    case 'messageStatus': {
      const list = state.messages[action.chatId] ?? []
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.chatId]: list.map((m) =>
            m.id === action.id
              ? { ...m, status: action.status, serverId: action.serverId ?? m.serverId }
              : m,
          ),
        },
      }
    }
    case 'synced': {
      const merged = mergeState(state, action.remote)
      const chats = merged.chats.map((c) => (c.id === state.activeChatId ? { ...c, unread: 0 } : c))
      return { ...merged, chats, activeChatId: state.activeChatId }
    }
  }
}

const storageKey = (idInstance: string) => `green-chat:${idInstance}`
const STALE_SENDING_MS = 2 * 60 * 1000

function parse(raw: string | null): PersistedState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return { chats: parsed.chats ?? [], messages: parsed.messages ?? {} }
  } catch {
    return null
  }
}

function load(idInstance: string): ChatState {
  let persisted: PersistedState = emptyPersisted
  try {
    persisted = parse(localStorage.getItem(storageKey(idInstance))) ?? emptyPersisted
  } catch {
    /* хранилище недоступно */
  }
  // Сообщения, «зависшие» в отправке (вкладку закрыли до ответа сервера), помечаем ошибочными.
  // Свежие не трогаем: их отправка может ещё идти в другой открытой вкладке.
  const staleBefore = Date.now() - STALE_SENDING_MS
  const messages = Object.fromEntries(
    Object.entries(persisted.messages).map(([chatId, list]) => [
      chatId,
      list.map((m) =>
        m.status === 'sending' && m.timestamp < staleBefore ? { ...m, status: 'error' as const } : m,
      ),
    ]),
  )
  return { chats: persisted.chats, messages, activeChatId: null }
}

export function useChatStore(idInstance: string) {
  const [state, dispatch] = useReducer(chatReducer, idInstance, load)
  const { chats, messages } = state

  useEffect(() => {
    try {
      // setItem с тем же значением не порождает событие storage, поэтому «пинг-понга» нет
      localStorage.setItem(storageKey(idInstance), JSON.stringify({ chats, messages }))
    } catch {
      /* хранилище недоступно — работаем без сохранения */
    }
  }, [idInstance, chats, messages])

  // Изменения из других вкладок с тем же инстансом.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== storageKey(idInstance)) return
      const remote = parse(e.newValue)
      if (remote) dispatch({ type: 'synced', remote })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [idInstance])

  return [state, dispatch] as const
}
