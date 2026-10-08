import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkAccount,
  deleteNotification,
  getSettings,
  getStateInstance,
  receiveNotification,
  sendMessage,
  setSettings,
} from './greenApi'

const creds = { idInstance: '410012345678', apiTokenInstance: 'TOKEN', apiUrl: '' }
const base = 'https://4100.api.green-api.com/waInstance410012345678'

function mockFetch(status = 200, body: unknown = {}) {
  const fn = vi.fn(async () => new Response(body === null ? '' : JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

const call = (fn: ReturnType<typeof mockFetch>) =>
  fn.mock.calls[0] as unknown as [string, RequestInit | undefined]

afterEach(() => vi.unstubAllGlobals())

describe('адреса методов совпадают с документацией GREEN-API', () => {
  it('deleteNotification: /deleteNotification/{token}/{receiptId}, DELETE', async () => {
    const f = mockFetch(200, { result: true })
    await deleteNotification(creds, 42)
    const [url, init] = call(f)
    expect(url).toBe(`${base}/deleteNotification/TOKEN/42`)
    expect(init?.method).toBe('DELETE')
  })

  it('receiveNotification: /receiveNotification/{token}?receiveTimeout=N, GET', async () => {
    const f = mockFetch(200, null)
    expect(await receiveNotification(creds, new AbortController().signal, 20)).toBeNull()
    expect(call(f)[0]).toBe(`${base}/receiveNotification/TOKEN?receiveTimeout=20`)
  })

  it('receiveNotification: 408 — пустая очередь, а не ошибка', async () => {
    mockFetch(408, null)
    expect(await receiveNotification(creds, new AbortController().signal)).toBeNull()
  })

  it('sendMessage: POST /sendMessage/{token} с chatId и message', async () => {
    const f = mockFetch(200, { idMessage: 'X' })
    await sendMessage(creds, '100', 'Привет')
    const [url, init] = call(f)
    expect(url).toBe(`${base}/sendMessage/TOKEN`)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ chatId: '100', message: 'Привет' })
  })

  it('checkAccount: POST /checkAccount/{token} с числовым phoneNumber', async () => {
    const f = mockFetch(200, { exist: true, chatId: '1' })
    await checkAccount(creds, '79991234567')
    expect(call(f)[0]).toBe(`${base}/checkAccount/TOKEN`)
    expect(JSON.parse(String(call(f)[1]?.body))).toEqual({ phoneNumber: 79991234567 })
  })

  it('getStateInstance, getSettings, setSettings', async () => {
    let f = mockFetch(200, { stateInstance: 'authorized' })
    await getStateInstance(creds)
    expect(call(f)[0]).toBe(`${base}/getStateInstance/TOKEN`)
    f = mockFetch(200, {})
    await getSettings(creds)
    expect(call(f)[0]).toBe(`${base}/getSettings/TOKEN`)
    f = mockFetch(200, { saveSettings: true })
    await setSettings(creds, { incomingWebhook: 'yes' })
    expect(call(f)[0]).toBe(`${base}/setSettings/TOKEN`)
  })
})
