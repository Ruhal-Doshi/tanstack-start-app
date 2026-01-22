// localStorage helpers for anonymous user chat history

const ANON_SESSIONS_KEY = 'anon_chat_sessions'
const ANON_MESSAGES_KEY = 'anon_chat_messages'
const ANON_USER_ID_KEY = 'anonymous_user_id'

export interface AnonSession {
  sessionId: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface AnonMessage {
  messageId: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}

// Generate or retrieve anonymous user ID from localStorage
export function getAnonymousUserId(): string {
  let userId = localStorage.getItem(ANON_USER_ID_KEY)
  if (!userId) {
    userId = `anon_${crypto.randomUUID()}`
    localStorage.setItem(ANON_USER_ID_KEY, userId)
  }
  return userId
}

export function getAnonSessions(): AnonSession[] {
  try {
    const data = localStorage.getItem(ANON_SESSIONS_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function saveAnonSessions(sessions: AnonSession[]) {
  localStorage.setItem(ANON_SESSIONS_KEY, JSON.stringify(sessions))
}

export function getAnonMessages(sessionId: string): AnonMessage[] {
  try {
    const data = localStorage.getItem(ANON_MESSAGES_KEY)
    const allMessages: AnonMessage[] = data ? JSON.parse(data) : []
    return allMessages
      .filter((m) => m.sessionId === sessionId)
      .sort((a, b) => a.createdAt - b.createdAt)
  } catch {
    return []
  }
}

export function saveAnonMessage(message: AnonMessage) {
  try {
    const data = localStorage.getItem(ANON_MESSAGES_KEY)
    const allMessages: AnonMessage[] = data ? JSON.parse(data) : []
    allMessages.push(message)
    localStorage.setItem(ANON_MESSAGES_KEY, JSON.stringify(allMessages))
  } catch {
    // Ignore storage errors
  }
}

export function createAnonSession(sessionId: string, title: string) {
  const sessions = getAnonSessions()
  const now = Date.now()
  sessions.unshift({ sessionId, title, createdAt: now, updatedAt: now })
  saveAnonSessions(sessions)
}

export function deleteAnonSession(sessionId: string) {
  // Delete session
  const sessions = getAnonSessions().filter((s) => s.sessionId !== sessionId)
  saveAnonSessions(sessions)
  // Delete messages
  try {
    const data = localStorage.getItem(ANON_MESSAGES_KEY)
    const allMessages: AnonMessage[] = data ? JSON.parse(data) : []
    const filtered = allMessages.filter((m) => m.sessionId !== sessionId)
    localStorage.setItem(ANON_MESSAGES_KEY, JSON.stringify(filtered))
  } catch {
    // Ignore
  }
}
