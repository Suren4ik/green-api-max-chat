import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  deleteNotification,
  getSettings,
  isTransient,
  receiveNotification,
  receivingProblem,
  type IncomingNotification,
} from '../api/greenApi'
import type { ChatAction } from '../store/chatStore'
import type { Credentials } from '../types'

const RETRY_BASE_MS = 2000
const RETRY_MAX_MS = 30000
const SETTINGS_RECHECK_MS = 30000

export interface PollingStatus {
  /** standby — очередь опрашивает другая вкладка с этим же инстансом */
  state: 'connecting' | 'ok' | 'error' | 'standby'
  error?: string
}

export interface SettingsStatus {
  /** мессенджер инстанса из GetSettings (max, telegram, …) */
  typeInstance?: string
  /** что мешает получать входящие; null — всё в порядке */
  problem: string | null
}

function extractText(n: IncomingNotification): string | undefined {
  const data = n.body.messageData
  if (!data) return undefined
  if (data.typeMessage === 'textMessage') return data.textMessageData?.textMessage
  if (data.typeMessage === 'extendedTextMessage') return data.extendedTextMessageData?.text
  return `[Вложение: ${data.typeMessage}. В этой версии поддерживается только текст]`
}

export function toAction(n: IncomingNotification): ChatAction | null {
  const { body } = n
  if (body.typeWebhook !== 'incomingMessageReceived') return null
  const text = extractText(n)
  if (!text || !body.senderData || !body.idMessage) return null
  const phone = body.senderData.senderPhoneNumber
  return {
    type: 'messageAdded',
    title: body.senderData.senderName || body.senderData.chatName,
    phone: phone ? String(phone) : undefined,
    message: {
      id: body.idMessage,
      chatId: body.senderData.chatId,
      text,
      timestamp: (body.timestamp ?? Math.floor(Date.now() / 1000)) * 1000,
      direction: 'in',
    },
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
  })
}

/**
 * Приём входящих через HTTP API: receiveNotification → обработка → deleteNotification.
 * Очередь у инстанса одна, поэтому опрашивает её только одна вкладка (Web Locks API),
 * остальные получают сообщения через синхронизацию localStorage.
 */
export function useNotifications(
  credentials: Credentials,
  dispatch: (a: ChatAction) => void,
  onFatalError: (message: string) => void,
) {
  const [polling, setPolling] = useState<PollingStatus>({ state: 'connecting' })
  const [settings, setSettingsStatus] = useState<SettingsStatus>({ problem: null })
  const [recheckToken, setRecheckToken] = useState(0)

  const dispatchRef = useRef(dispatch)
  const fatalRef = useRef(onFatalError)
  useEffect(() => {
    dispatchRef.current = dispatch
    fatalRef.current = onFatalError
  })

  const { idInstance, apiTokenInstance, apiUrl } = credentials

  // Проверка настроек инстанса: пока приём выключен, перепроверяем периодически.
  useEffect(() => {
    const controller = new AbortController()
    const creds = { idInstance, apiTokenInstance, apiUrl }
    void (async () => {
      let failures = 0
      while (!controller.signal.aborted) {
        let delay = SETTINGS_RECHECK_MS
        try {
          const s = await getSettings(creds)
          if (controller.signal.aborted) return
          failures = 0
          const problem = receivingProblem(s)
          setSettingsStatus({ typeInstance: s.typeInstance, problem })
          if (!problem) return
        } catch (e) {
          if (controller.signal.aborted) return
          if (!isTransient(e)) return // 401/404 обработает цикл опроса
          // GREEN-API эпизодически отвечает 503 — повторяем быстро, с нарастающей паузой
          failures += 1
          delay = Math.min(RETRY_BASE_MS * 2 ** (failures - 1), RETRY_MAX_MS)
        }
        await sleep(delay, controller.signal)
      }
    })()
    return () => controller.abort()
  }, [idInstance, apiTokenInstance, apiUrl, recheckToken])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const creds = { idInstance, apiTokenInstance, apiUrl }
    // не перерисовываем интерфейс на каждом цикле опроса, если статус не изменился
    const report = (state: PollingStatus['state'], error?: string) =>
      setPolling((prev) => (prev.state === state && prev.error === error ? prev : { state, error }))

    async function loop() {
      report('connecting')
      let failures = 0
      while (!signal.aborted) {
        try {
          const n = await receiveNotification(creds, signal)
          failures = 0
          report('ok')
          if (!n) continue
          console.debug('[green-api] notification', n)
          const action = toAction(n)
          if (action) dispatchRef.current(action)
          await deleteNotification(creds, n.receiptId)
          report('ok')
        } catch (e) {
          if (signal.aborted) return
          console.warn('[green-api] polling error', e)
          // Инстанса не существует — продолжать бессмысленно, возвращаемся ко входу.
          if (e instanceof ApiError && e.status === 404) {
            fatalRef.current(e.message)
            return
          }
          // 401/403 GREEN-API отдаёт и временно (например, пока инстанс перезапускается после
          // SetSettings), поэтому сессию не сбрасываем: показываем ошибку и повторяем с паузой.
          report('error', e instanceof Error ? e.message : String(e))
          // экспоненциальная пауза, чтобы не упереться в rate limit при сбоях
          failures += 1
          await sleep(Math.min(RETRY_BASE_MS * 2 ** (failures - 1), RETRY_MAX_MS), signal)
        }
      }
    }

    if ('locks' in navigator) {
      report('standby')
      navigator.locks
        .request(`green-chat:poll:${idInstance}`, { signal }, () => loop())
        .catch(() => {
          /* AbortError при выходе или закрытии вкладки */
        })
    } else {
      void loop()
    }
    return () => controller.abort()
  }, [idInstance, apiTokenInstance, apiUrl])

  const recheckSettings = useCallback(() => setRecheckToken((t) => t + 1), [])

  return { polling, settings, recheckSettings }
}
