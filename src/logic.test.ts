import { describe, expect, it } from 'vitest'
import { defaultApiUrl, receivingProblem, resolveApiUrl } from './api/greenApi'
import { toAction } from './hooks/useNotifications'
import { chatReducer, mergeState, type ChatState } from './store/chatStore'
import type { ChatMessage } from './types'
import { normalizePhone } from './utils/phone'

const empty: ChatState = { chats: [], messages: {}, activeChatId: null }

const incoming = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'IN1',
  chatId: '100',
  text: 'привет',
  timestamp: 1000,
  direction: 'in',
  ...over,
})

describe('normalizePhone', () => {
  it('оставляет только цифры и меняет ведущую 8 на 7', () => {
    expect(normalizePhone('8 (999) 123-45-67')).toBe('79991234567')
    expect(normalizePhone('+7 999 123 45 67')).toBe('79991234567')
    expect(normalizePhone('380501234567')).toBe('380501234567')
  })
})

describe('адрес API', () => {
  it('строится по первым 4 цифрам idInstance', () => {
    expect(defaultApiUrl('410012345678')).toBe('https://4100.api.green-api.com')
  })
  it('старый общий хост заменяется на хост инстанса, свой адрес сохраняется', () => {
    const c = { idInstance: '410012345678', apiTokenInstance: 't' }
    expect(resolveApiUrl({ ...c, apiUrl: 'https://api.green-api.com' })).toBe(
      'https://4100.api.green-api.com',
    )
    expect(resolveApiUrl({ ...c, apiUrl: 'https://7103.api.greenapi.com' })).toBe(
      'https://7103.api.greenapi.com',
    )
  })
})

describe('receivingProblem', () => {
  it('сообщает о выключенных входящих и о заданном webhookUrl', () => {
    expect(receivingProblem({ incomingWebhook: 'no', webhookUrl: '' })).toMatch(/выключено/)
    expect(receivingProblem({ incomingWebhook: 'yes', webhookUrl: 'https://x' })).toMatch(/webhookUrl/)
    expect(receivingProblem({ incomingWebhook: 'yes', webhookUrl: '' })).toBeNull()
  })
})

describe('toAction', () => {
  const base = {
    receiptId: 1,
    body: {
      typeWebhook: 'incomingMessageReceived',
      timestamp: 1763115112,
      idMessage: 'ABC',
      senderData: { chatId: '10000000', senderName: 'Имя', senderPhoneNumber: 79876543210 },
      messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Текст' } },
    },
  }

  it('разбирает входящее текстовое сообщение по формату из документации', () => {
    expect(toAction(base)).toEqual({
      type: 'messageAdded',
      title: 'Имя',
      phone: '79876543210',
      message: {
        id: 'ABC',
        chatId: '10000000',
        text: 'Текст',
        timestamp: 1763115112000,
        direction: 'in',
      },
    })
  })

  it('берёт текст из extendedTextMessage', () => {
    const n = {
      ...base,
      body: {
        ...base.body,
        messageData: { typeMessage: 'extendedTextMessage', extendedTextMessageData: { text: 'Ссылка' } },
      },
    }
    expect(toAction(n)?.type === 'messageAdded' && toAction(n)).toMatchObject({
      message: { text: 'Ссылка' },
    })
  })

  it('пропускает уведомления других типов', () => {
    expect(toAction({ receiptId: 2, body: { typeWebhook: 'stateInstanceChanged' } })).toBeNull()
  })
})

describe('chatReducer', () => {
  it('отбрасывает дубль входящего по idMessage', () => {
    const s1 = chatReducer(empty, { type: 'messageAdded', message: incoming() })
    const s2 = chatReducer(s1, { type: 'messageAdded', message: incoming() })
    expect(s2).toBe(s1)
  })

  it('создаёт чат для неизвестного отправителя и считает непрочитанные', () => {
    const s = chatReducer(empty, { type: 'messageAdded', message: incoming(), title: 'Имя' })
    expect(s.chats).toMatchObject([{ id: '100', title: 'Имя', unread: 1 }])
  })

  it('кладёт ответ в чат, созданный по номеру, если chatId не совпал', () => {
    const opened = chatReducer(empty, {
      type: 'chatOpened',
      chat: { id: '555', title: '+79991234567', phone: '79991234567', lastActivity: 0, unread: 0 },
    })
    const s = chatReducer(opened, {
      type: 'messageAdded',
      message: incoming({ chatId: '999' }),
      phone: '79991234567',
    })
    expect(s.chats).toHaveLength(1)
    expect(s.messages['555']).toHaveLength(1)
  })

  it('обновляет статус исходящего, сохраняя локальный id', () => {
    const out = incoming({ id: 'local-1', direction: 'out', status: 'sending' })
    const s1 = chatReducer(empty, { type: 'messageAdded', message: out })
    const s2 = chatReducer(s1, {
      type: 'messageStatus',
      chatId: '100',
      id: 'local-1',
      status: 'sent',
      serverId: 'SRV',
    })
    expect(s2.messages['100'][0]).toMatchObject({ id: 'local-1', status: 'sent', serverId: 'SRV' })
  })
})

describe('mergeState (синхронизация вкладок)', () => {
  it('не теряет сообщения, записанные двумя вкладками одновременно', () => {
    const a = chatReducer(empty, { type: 'messageAdded', message: incoming({ id: 'A' }) })
    const b = chatReducer(empty, {
      type: 'messageAdded',
      message: incoming({ id: 'B', timestamp: 2000, direction: 'out', status: 'sending' }),
    })
    const merged = mergeState(a, b)
    expect(merged.messages['100'].map((m) => m.id)).toEqual(['A', 'B'])
  })

  it('предпочитает более «продвинутый» статус и сходится при повторном слиянии', () => {
    const sending = incoming({ id: 'L', direction: 'out', status: 'sending' })
    const a = { chats: [], messages: { '100': [{ ...sending, status: 'sent' as const }] } }
    const b = { chats: [], messages: { '100': [sending] } }
    const ab = mergeState(a, b)
    expect(ab.messages['100'][0].status).toBe('sent')
    expect(mergeState(ab, ab)).toEqual(ab)
  })

  it('не меняет открытый во вкладке чат при синхронизации', () => {
    const local = { ...empty, activeChatId: 'mine' }
    const s = chatReducer(local, { type: 'synced', remote: { chats: [], messages: {} } })
    expect(s.activeChatId).toBe('mine')
  })
})
