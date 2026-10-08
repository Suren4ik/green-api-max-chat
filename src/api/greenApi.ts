import type { Credentials } from '../types'

/** Прежний общий хост: у каждого инстанса свой, поэтому он больше не используется по умолчанию. */
const LEGACY_API_URL = 'https://api.green-api.com'

/** Хост инстанса строится по первым 4 цифрам idInstance: 410012345678 → 4100.api.green-api.com. */
export function defaultApiUrl(idInstance: string): string {
  return `https://${idInstance.trim().slice(0, 4)}.api.green-api.com`
}

export function resolveApiUrl(c: Credentials): string {
  const custom = c.apiUrl?.trim()
  return !custom || custom === LEGACY_API_URL ? defaultApiUrl(c.idInstance) : custom
}

export class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export type InstanceState =
  | 'notAuthorized'
  | 'authorized'
  | 'blocked'
  | 'starting'
  | 'suspended'
  | 'pendingPassword'

export interface IncomingNotification {
  receiptId: number
  body: {
    typeWebhook: string
    timestamp?: number
    idMessage?: string
    senderData?: {
      chatId: string
      senderName?: string
      chatName?: string
      sender?: string
      senderPhoneNumber?: number | string
    }
    messageData?: {
      typeMessage: string
      textMessageData?: { textMessage: string }
      extendedTextMessageData?: { text: string }
    }
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Некорректный запрос',
  401: 'Неверный idInstance или apiTokenInstance',
  403: 'Доступ запрещён',
  404: 'Инстанс не найден. Проверьте idInstance и адрес API',
  429: 'Слишком много запросов, повторите чуть позже',
  466: 'Превышена квота инстанса',
  500: 'Внутренняя ошибка GREEN-API',
  502: 'GREEN-API временно недоступен',
  503: 'GREEN-API временно недоступен',
  504: 'GREEN-API не ответил вовремя',
}

/** Ошибки, после которых запрос имеет смысл повторить. */
export function isTransient(e: unknown): boolean {
  return !(e instanceof ApiError) || e.status === undefined || e.status === 429 || e.status >= 500
}

/** {{apiUrl}}/waInstance{{idInstance}}/{{method}}/{{apiTokenInstance}}[/{{param}}] — по документации. */
function instanceUrl(c: Credentials, method: string, param?: string | number): string {
  const base = resolveApiUrl(c).replace(/\/+$/, '')
  const tail = param === undefined ? '' : `/${param}`
  return `${base}/waInstance${c.idInstance}/${method}/${c.apiTokenInstance}${tail}`
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError('Нет связи с GREEN-API. Проверьте подключение к сети')
  }
  if (!res.ok) {
    throw new ApiError(STATUS_MESSAGES[res.status] ?? `Ошибка сервера (${res.status})`, res.status)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export async function getStateInstance(c: Credentials): Promise<InstanceState> {
  const data = await request<{ stateInstance: InstanceState }>(instanceUrl(c, 'getStateInstance'))
  return data.stateInstance
}

export interface InstanceSettings {
  typeInstance?: string
  webhookUrl?: string
  incomingWebhook?: 'yes' | 'no'
}

export async function getSettings(c: Credentials): Promise<InstanceSettings> {
  return request(instanceUrl(c, 'getSettings'))
}

/** Применяется GREEN-API в течение 5 минут, инстанс при этом перезапускается. */
export async function setSettings(
  c: Credentials,
  settings: InstanceSettings,
): Promise<{ saveSettings: boolean }> {
  return request(instanceUrl(c, 'setSettings'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
}

/** Что мешает получать сообщения через HTTP API (см. документацию «Технология HTTP API»). */
export function receivingProblem(s: InstanceSettings): string | null {
  if (s.webhookUrl) return 'В настройках инстанса задан webhookUrl: уведомления уходят на него, а не в HTTP API'
  if (s.incomingWebhook !== 'yes') return 'В настройках инстанса выключено получение входящих сообщений'
  return null
}

export async function checkAccount(
  c: Credentials,
  phoneNumber: string,
): Promise<{ exist: boolean; chatId: string }> {
  return request(instanceUrl(c, 'checkAccount'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: Number(phoneNumber) }),
  })
}

export async function sendMessage(
  c: Credentials,
  chatId: string,
  message: string,
): Promise<{ idMessage: string }> {
  return request(instanceUrl(c, 'sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
  })
}

export async function receiveNotification(
  c: Credentials,
  signal: AbortSignal,
  receiveTimeout = 20,
): Promise<IncomingNotification | null> {
  try {
    return await request(instanceUrl(c, 'receiveNotification') + `?receiveTimeout=${receiveTimeout}`, {
      signal,
    })
  } catch (e) {
    // 408 — штатный ответ «за время ожидания новых уведомлений нет»
    if (e instanceof ApiError && e.status === 408) return null
    throw e
  }
}

export async function deleteNotification(c: Credentials, receiptId: number): Promise<void> {
  const res = await request<{ result: boolean; reason?: string } | null>(
    instanceUrl(c, 'deleteNotification', receiptId),
    { method: 'DELETE' },
  )
  // result: false — уведомление уже удалено (например, другим клиентом); это не ошибка
  if (res && !res.result) console.debug('[green-api] deleteNotification: result=false', res.reason)
}
