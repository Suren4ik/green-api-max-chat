import { useState, type FormEvent } from 'react'
import { ApiError, checkAccount } from '../api/greenApi'
import type { Chat, Credentials } from '../types'
import { normalizePhone } from '../utils/phone'

interface Props {
  credentials: Credentials
  onCreate: (chat: Chat) => void
  onClose: () => void
}

export function NewChatDialog({ credentials, onCreate, onClose }: Props) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const normalized = normalizePhone(phone)
    if (normalized.length < 11 || normalized.length > 12) {
      setError('Введите номер в международном формате, например 79991234567')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await checkAccount(credentials, normalized)
      if (!res.exist || !res.chatId) {
        setError('Для этого номера аккаунт в мессенджере не найден')
        return
      }
      onCreate({
        id: res.chatId,
        title: `+${normalized}`,
        phone: normalized,
        lastActivity: Date.now(),
        unread: 0,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось проверить номер')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form className="dialog" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <h2>Новый чат</h2>
        <label>
          Номер телефона
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="79991234567"
            inputMode="tel"
            autoFocus
          />
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="dialog__actions">
          <button type="button" className="secondary" onClick={onClose}>
            Отмена
          </button>
          <button className="primary" disabled={loading}>
            {loading ? 'Проверяем…' : 'Создать'}
          </button>
        </div>
      </form>
    </div>
  )
}
