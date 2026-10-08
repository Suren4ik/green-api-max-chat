export interface Credentials {
  idInstance: string
  apiTokenInstance: string
  apiUrl: string
}

export type MessageStatus = 'sending' | 'sent' | 'error'

export interface ChatMessage {
  /** входящие — idMessage GREEN-API; исходящие — локальный id, стабильный между вкладками */
  id: string
  /** idMessage, выданный GREEN-API исходящему сообщению после sendMessage */
  serverId?: string
  chatId: string
  text: string
  timestamp: number
  direction: 'in' | 'out'
  status?: MessageStatus
}

export interface Chat {
  id: string
  title: string
  phone?: string
  lastActivity: number
  unread: number
}
