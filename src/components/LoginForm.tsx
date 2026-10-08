import { useState, type FormEvent } from 'react'
import { ApiError, defaultApiUrl, getStateInstance, type InstanceState } from '../api/greenApi'
import type { Credentials } from '../types'

const STATE_ERRORS: Partial<Record<InstanceState, string>> = {
  notAuthorized: 'Инстанс не авторизован: отсканируйте QR-код в личном кабинете GREEN-API',
  blocked: 'Аккаунт заблокирован',
  starting: 'Инстанс запускается (до 5 минут), попробуйте чуть позже',
  suspended: 'Инстанс приостановлен',
  pendingPassword: 'Инстанс ожидает пароль двухфакторной авторизации',
}

interface Props {
  onLogin: (credentials: Credentials) => void
  initialError?: string
}

export function LoginForm({ onLogin, initialError }: Props) {
  const [idInstance, setIdInstance] = useState('')
  const [apiTokenInstance, setToken] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [error, setError] = useState(initialError ?? '')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const credentials = {
      idInstance: idInstance.trim(),
      apiTokenInstance: apiTokenInstance.trim(),
      apiUrl: apiUrl.trim() || defaultApiUrl(idInstance),
    }
    setError('')
    setLoading(true)
    try {
      const state = await getStateInstance(credentials)
      const problem = STATE_ERRORS[state]
      if (problem) setError(problem)
      else onLogin(credentials)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось проверить данные')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <div className="login__logo" aria-hidden="true" />
        <h1>Вход в чат</h1>
        <p className="login__hint">Введите данные инстанса GREEN-API (MAX или Telegram)</p>

        <label>
          idInstance
          <input
            value={idInstance}
            onChange={(e) => setIdInstance(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            required
            autoFocus
          />
        </label>
        <label>
          apiTokenInstance
          <input
            type="password"
            value={apiTokenInstance}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
        <details>
          <summary>Дополнительно</summary>
          <label>
            Адрес API
            <input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={idInstance.length >= 4 ? defaultApiUrl(idInstance) : 'определяется по idInstance'}
              type="url"
            />
          </label>
        </details>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="primary" disabled={loading}>
          {loading ? 'Проверяем…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}
