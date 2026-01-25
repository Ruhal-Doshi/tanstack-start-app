// localStorage helpers for anonymous user chat history

const ANON_SESSIONS_KEY = 'anon_chat_sessions'
const ANON_MESSAGES_KEY = 'anon_chat_messages'
const ANON_USER_ID_KEY = 'anonymous_user_id'

// Pagination constants
const SESSIONS_PAGE_SIZE = 20
const MESSAGES_PAGE_SIZE = 50

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

export interface PaginatedSessions {
  sessions: AnonSession[]
  nextCursor: number | null
  hasMore: boolean
}

export interface PaginatedMessages {
  messages: AnonMessage[]
  nextCursor: number | null
  hasMore: boolean
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

// Paginated sessions - cursor is the index to start from
export function getAnonSessionsPaginated(
  cursor: number | null = null,
  limit: number = SESSIONS_PAGE_SIZE,
): PaginatedSessions {
  try {
    const allSessions = getAnonSessions()
    // Sessions are already sorted by updatedAt desc when saved
    const startIndex = cursor ?? 0
    const endIndex = startIndex + limit
    const sessions = allSessions.slice(startIndex, endIndex)
    const hasMore = endIndex < allSessions.length

    return {
      sessions,
      nextCursor: hasMore ? endIndex : null,
      hasMore,
    }
  } catch {
    return { sessions: [], nextCursor: null, hasMore: false }
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

// Paginated messages - fetches from newest first, returns in chronological order
// cursor is the index from the end (for loading older messages)
export function getAnonMessagesPaginated(
  sessionId: string,
  cursor: number | null = null,
  limit: number = MESSAGES_PAGE_SIZE,
): PaginatedMessages {
  try {
    const allMessages = getAnonMessages(sessionId)
    // For reverse pagination (loading older), we work from the end
    // cursor represents how many messages from the end we've already loaded
    const totalCount = allMessages.length
    const endOffset = cursor ?? 0
    const startOffset = endOffset + limit

    // Calculate actual indices
    const endIndex = totalCount - endOffset
    const startIndex = Math.max(0, totalCount - startOffset)

    const messages = allMessages.slice(startIndex, endIndex)
    const hasMore = startIndex > 0

    return {
      messages,
      nextCursor: hasMore ? startOffset : null,
      hasMore,
    }
  } catch {
    return { messages: [], nextCursor: null, hasMore: false }
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
