import { useState } from 'react'
import { ChatApp } from './components/ChatApp'
import { LoginForm } from './components/LoginForm'
import type { Credentials } from './types'

const CREDENTIALS_KEY = 'green-chat:credentials'

function loadCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY)
    return raw ? (JSON.parse(raw) as Credentials) : null
  } catch {
    return null
  }
}

export default function App() {
  const [credentials, setCredentials] = useState(loadCredentials)
  const [loginError, setLoginError] = useState('')

  function login(c: Credentials) {
    try {
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(c))
    } catch {
      /* работаем без сохранения сессии */
    }
    setLoginError('')
    setCredentials(c)
  }

  function logout(error = '') {
    try {
      localStorage.removeItem(CREDENTIALS_KEY)
    } catch {
      /* ignore */
    }
    setLoginError(error)
    setCredentials(null)
  }

  return credentials ? (
    <ChatApp key={credentials.idInstance} credentials={credentials} onLogout={logout} />
  ) : (
    <LoginForm onLogin={login} initialError={loginError} />
  )
}
