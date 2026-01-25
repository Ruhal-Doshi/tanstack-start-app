import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { z } from 'zod'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import { useAuth } from '@clerk/clerk-react'
import { usePaginatedQuery, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import {
  ChatSidebar,
  ChatMessages,
  ChatInput,
  ChatHeader,
  ChatSkeleton,
  RateLimitModal,
  type ChatMessage,
  type ChatMessagesHandle,
} from '@/components/chat'
import {
  type AnonSession,
  type AnonMessage,
  getAnonymousUserId,
  getAnonSessions,
  getAnonMessages,
  getAnonSessionsPaginated,
  getAnonMessagesPaginated,
  saveAnonMessage,
  createAnonSession,
  deleteAnonSession,
} from '@/lib/anonymous-storage'

// Search params schema
const chatSearchSchema = z.object({
  sessionId: z.string().optional(),
})

export const Route = createFileRoute('/')({
  validateSearch: chatSearchSchema,
  component: ChatPage,
})

function ChatPage() {
  const navigate = useNavigate()
  const { sessionId } = Route.useSearch()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const chatMessagesRef = useRef<ChatMessagesHandle>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Rate limit modal state
  const [rateLimitModalOpen, setRateLimitModalOpen] = useState(false)
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    limit: number
    resetAt?: string
  }>({ limit: 5 })

  // Get auth token from Clerk
  const { getToken, userId: clerkUserId, isLoaded: isClerkLoaded } = useAuth()
  const isAuthenticated = !!clerkUserId

  // For anonymous users, manage sessions/messages in localStorage with pagination
  const [anonSessions, setAnonSessions] = useState<AnonSession[]>([])
  const [anonSessionsHasMore, setAnonSessionsHasMore] = useState(false)
  const [anonSessionsCursor, setAnonSessionsCursor] = useState<number | null>(
    null,
  )
  const [anonMessages, setAnonMessages] = useState<AnonMessage[]>([])
  const [anonMessagesHasMore, setAnonMessagesHasMore] = useState(false)
  const [anonMessagesCursor, setAnonMessagesCursor] = useState<number | null>(
    null,
  )

  // Load anonymous sessions with pagination
  const loadAnonSessions = useCallback(
    (reset = false) => {
      const cursor = reset ? null : anonSessionsCursor
      const result = getAnonSessionsPaginated(cursor)
      if (reset) {
        setAnonSessions(result.sessions)
      } else {
        setAnonSessions((prev) => [...prev, ...result.sessions])
      }
      setAnonSessionsHasMore(result.hasMore)
      setAnonSessionsCursor(result.nextCursor)
    },
    [anonSessionsCursor],
  )

  // Load anonymous messages with pagination
  const loadAnonMessages = useCallback(
    (sid: string, reset = false) => {
      const cursor = reset ? null : anonMessagesCursor
      const result = getAnonMessagesPaginated(sid, cursor)
      if (reset) {
        setAnonMessages(result.messages)
      } else {
        // Prepend older messages
        setAnonMessages((prev) => [...result.messages, ...prev])
      }
      setAnonMessagesHasMore(result.hasMore)
      setAnonMessagesCursor(result.nextCursor)
    },
    [anonMessagesCursor],
  )

  // Initial load for anonymous users
  useEffect(() => {
    if (!isAuthenticated) {
      loadAnonSessions(true)
      if (sessionId) {
        loadAnonMessages(sessionId, true)
      } else {
        setAnonMessages([])
        setAnonMessagesHasMore(false)
        setAnonMessagesCursor(null)
      }
    }
  }, [isAuthenticated, sessionId])

  // Convex paginated queries (only for authenticated users)
  const {
    results: convexSessions,
    status: sessionsStatus,
    loadMore: loadMoreSessions,
  } = usePaginatedQuery(
    api.chat.listSessionsPaginated,
    isAuthenticated && clerkUserId ? { userId: clerkUserId } : 'skip',
    { initialNumItems: 20 },
  )

  const {
    results: convexMessages,
    status: messagesStatus,
    loadMore: loadMoreMessages,
  } = usePaginatedQuery(
    api.chat.getMessagesPaginated,
    isAuthenticated && sessionId ? { sessionId } : 'skip',
    { initialNumItems: 50 },
  )

  // Also keep the full messages query for sending to API (all messages for context)
  const allConvexMessages = useQuery(
    api.chat.getMessages,
    isAuthenticated && sessionId ? { sessionId } : 'skip',
  )

  const deleteSessionMutation = useMutation(api.chat.deleteSession)

  // Determine loading states
  const isLoadingMoreSessions = sessionsStatus === 'LoadingMore'
  const sessionsHasMore = sessionsStatus === 'CanLoadMore'
  const isLoadingMoreMessages = messagesStatus === 'LoadingMore'
  const messagesHasMore = messagesStatus === 'CanLoadMore'

  // Use Convex data for auth users, localStorage for anonymous
  const sessions = isAuthenticated ? convexSessions : anonSessions
  const storedMessages = isAuthenticated ? convexMessages : anonMessages

  // Refs for callbacks
  const sessionIdRef = useRef<string | undefined>(sessionId)
  const currentUserMessageIdRef = useRef<string | null>(null)
  const currentAssistantMessageIdRef = useRef<string | null>(null)
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null)
  const pendingUserMessageRef = useRef<string | null>(null)
  const isAuthenticatedRef = useRef(isAuthenticated)
  const storedMessagesRef = useRef(storedMessages)
  const allConvexMessagesRef = useRef(allConvexMessages)
  isAuthenticatedRef.current = isAuthenticated
  storedMessagesRef.current = storedMessages
  allConvexMessagesRef.current = allConvexMessages

  // Keep the ref in sync with the search param
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  // Navigate to new session when we receive the session ID from the server
  useEffect(() => {
    if (pendingSessionId && !sessionId) {
      navigate({
        to: '/',
        search: { sessionId: pendingSessionId },
        replace: true,
      })
      setPendingSessionId(null)
    }
  }, [pendingSessionId, sessionId, navigate])

  // Helper to extract text content from message parts
  const getMessageContent = (message: {
    parts: Array<{ type: string; content?: string }>
  }) => {
    return message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.content || '')
      .join('')
  }

  // Use TanStack AI chat hook
  const {
    messages,
    sendMessage: originalSendMessage,
    isLoading,
    clear: clearMessages,
  } = useChat({
    connection: fetchServerSentEvents('/api/chat', async () => {
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      // Build message history from stored messages
      // For anonymous users: from localStorage (all messages)
      // For authenticated users: from Convex (all messages, not paginated)
      let messageHistory: Array<{ role: string; content: string }> = []
      if (!isAuthenticatedRef.current && sessionIdRef.current) {
        // Anonymous: get all messages from localStorage
        const anonMsgs = getAnonMessages(sessionIdRef.current)
        messageHistory = anonMsgs.map((m) => ({
          role: m.role,
          content: m.content,
        }))
      } else if (isAuthenticatedRef.current && allConvexMessagesRef.current) {
        // Authenticated: use all Convex messages (not paginated) for full context
        messageHistory = allConvexMessagesRef.current.map((m) => ({
          role: m.role,
          content: m.content,
        }))
      }

      const anonymousId = !isAuthenticatedRef.current
        ? getAnonymousUserId()
        : undefined

      return {
        headers,
        body: {
          sessionId: sessionIdRef.current,
          userMessageId: currentUserMessageIdRef.current,
          anonymousId,
          isAnonymous: !isAuthenticatedRef.current,
          messageHistory,
        },
      }
    }),
    onChunk: (chunk: unknown) => {
      const metaChunk = chunk as {
        type?: string
        metadata?: {
          sessionId?: string
          userMessageId?: string
          assistantMessageId?: string
        }
      }
      if (metaChunk?.type === 'metadata') {
        if (metaChunk.metadata?.userMessageId) {
          currentUserMessageIdRef.current = metaChunk.metadata.userMessageId
        }
        if (metaChunk.metadata?.assistantMessageId) {
          currentAssistantMessageIdRef.current =
            metaChunk.metadata.assistantMessageId
        }
        const newSessionId = metaChunk.metadata?.sessionId
        if (newSessionId && !sessionIdRef.current) {
          sessionIdRef.current = newSessionId
          setPendingSessionId(newSessionId)

          if (!isAuthenticatedRef.current && pendingUserMessageRef.current) {
            createAnonSession(
              newSessionId,
              pendingUserMessageRef.current.slice(0, 50) || 'New Chat',
            )
            setAnonSessions(getAnonSessions())
          }
        }
      }
    },
    onFinish: (message: unknown) => {
      // For anonymous users, save messages to localStorage
      if (!isAuthenticatedRef.current && sessionIdRef.current) {
        const now = Date.now()

        if (pendingUserMessageRef.current && currentUserMessageIdRef.current) {
          saveAnonMessage({
            messageId: currentUserMessageIdRef.current,
            sessionId: sessionIdRef.current,
            role: 'user',
            content: pendingUserMessageRef.current,
            createdAt: now,
          })
        }

        const assistantContent =
          (
            message as { parts?: Array<{ type: string; content?: string }> }
          )?.parts
            ?.filter((p) => p.type === 'text')
            .map((p) => p.content || '')
            .join('') || ''

        if (assistantContent && currentAssistantMessageIdRef.current) {
          saveAnonMessage({
            messageId: currentAssistantMessageIdRef.current,
            sessionId: sessionIdRef.current,
            role: 'assistant',
            content: assistantContent,
            createdAt: now + 1,
          })
        }

        setAnonSessions(getAnonSessions())
        setAnonMessages(getAnonMessages(sessionIdRef.current))
      }

      clearMessages()
      currentUserMessageIdRef.current = null
      currentAssistantMessageIdRef.current = null
      pendingUserMessageRef.current = null
    },
    onError: (error: Error) => {
      // Check if error message contains rate limit info
      const errorMessage = error.message || ''
      if (
        errorMessage.includes('429') ||
        errorMessage.includes('Rate limit') ||
        errorMessage.includes('rate limit')
      ) {
        // Try to parse rate limit details from error
        try {
          const match = errorMessage.match(/limit of (\d+)/)
          const limit = match
            ? parseInt(match[1], 10)
            : isAuthenticated
              ? 10
              : 5
          setRateLimitInfo({ limit })
        } catch {
          setRateLimitInfo({ limit: isAuthenticated ? 10 : 5 })
        }
        setRateLimitModalOpen(true)
      }
      // Clear pending state on error
      currentUserMessageIdRef.current = null
      currentAssistantMessageIdRef.current = null
      pendingUserMessageRef.current = null
    },
  })

  // Wrap sendMessage to generate userMessageId and track content
  const sendMessage = async (content: string) => {
    currentUserMessageIdRef.current = crypto.randomUUID()
    pendingUserMessageRef.current = content
    try {
      await originalSendMessage(content)
    } catch (error) {
      // Handle rate limit error from fetch
      if (error instanceof Response && error.status === 429) {
        try {
          const data = await error.json()
          setRateLimitInfo({
            limit: data.limit || (isAuthenticated ? 10 : 5),
            resetAt: data.resetAt,
          })
        } catch {
          setRateLimitInfo({ limit: isAuthenticated ? 10 : 5 })
        }
        setRateLimitModalOpen(true)
      } else if (error instanceof Error) {
        // Check error message for rate limit
        const errorMessage = error.message || ''
        if (
          errorMessage.includes('429') ||
          errorMessage.includes('Rate limit')
        ) {
          setRateLimitInfo({ limit: isAuthenticated ? 10 : 5 })
          setRateLimitModalOpen(true)
        }
      }
      // Clear pending state
      currentUserMessageIdRef.current = null
      pendingUserMessageRef.current = null
    }
  }

  // Combine stored messages with the currently streaming message
  const allMessages: ChatMessage[] = useMemo(() => {
    const baseMsgs: ChatMessage[] = isAuthenticated
      ? (storedMessages || []).map((msg) => ({
          id: (msg as { messageId: string }).messageId,
          role: (msg as { role: string }).role as 'user' | 'assistant',
          content: (msg as { content: string }).content,
          createdAt: (msg as { createdAt: number }).createdAt,
          isStreaming: false,
        }))
      : ((storedMessages as AnonMessage[]) || []).map((msg) => ({
          id: msg.messageId,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt,
          isStreaming: false,
        }))

    if (isLoading && messages.length > 0) {
      const maxTimestamp = Math.max(0, ...baseMsgs.map((m) => m.createdAt))

      const hasUserMessage = currentUserMessageIdRef.current
        ? baseMsgs.some((m) => m.id === currentUserMessageIdRef.current)
        : false

      if (!hasUserMessage) {
        const userMsg = messages.find((m) => m.role === 'user')
        if (userMsg) {
          const content = getMessageContent(userMsg)
          baseMsgs.push({
            id: currentUserMessageIdRef.current || userMsg.id,
            role: 'user',
            content,
            createdAt: maxTimestamp + 1,
            isStreaming: false,
          })
        }
      }

      const hasAssistantMessage = currentAssistantMessageIdRef.current
        ? baseMsgs.some((m) => m.id === currentAssistantMessageIdRef.current)
        : false

      if (!hasAssistantMessage) {
        const assistantMsg = messages.find((m) => m.role === 'assistant')
        if (assistantMsg) {
          const content = getMessageContent(assistantMsg)
          const newMaxTimestamp = Math.max(
            maxTimestamp,
            ...baseMsgs.map((m) => m.createdAt),
          )
          baseMsgs.push({
            id: currentAssistantMessageIdRef.current || assistantMsg.id,
            role: 'assistant',
            content,
            createdAt: newMaxTimestamp + 1,
            isStreaming: true,
          })
        }
      }
    }

    baseMsgs.sort((a, b) => a.createdAt - b.createdAt)
    return baseMsgs
  }, [storedMessages, messages, isLoading, isAuthenticated])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (allMessages.length > 0) {
      chatMessagesRef.current?.scrollToBottom()
    }
  }, [allMessages.length])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [sessionId])

  const createNewSession = () => {
    clearMessages()
    // Reset anonymous pagination state
    if (!isAuthenticated) {
      setAnonMessages([])
      setAnonMessagesHasMore(false)
      setAnonMessagesCursor(null)
    }
    navigate({ to: '/', search: {} })
  }

  const selectSession = (id: string) => {
    clearMessages()
    // Reset anonymous messages pagination state
    if (!isAuthenticated) {
      setAnonMessages([])
      setAnonMessagesHasMore(false)
      setAnonMessagesCursor(null)
    }
    navigate({ to: '/', search: { sessionId: id } })
  }

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (isAuthenticated) {
      await deleteSessionMutation({ sessionId: id })
    } else {
      deleteAnonSession(id)
      loadAnonSessions(true)
      if (sessionId) {
        loadAnonMessages(sessionId, true)
      }
    }
    if (sessionId === id) {
      clearMessages()
      navigate({ to: '/', search: {} })
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isLoading) return
    sendMessage(inputValue)
    setInputValue('')
  }

  // Handlers for loading more
  const handleLoadMoreSessions = useCallback(() => {
    if (isAuthenticated) {
      loadMoreSessions(20)
    } else {
      loadAnonSessions(false)
    }
  }, [isAuthenticated, loadMoreSessions, loadAnonSessions])

  const handleLoadMoreMessages = useCallback(() => {
    if (isAuthenticated) {
      loadMoreMessages(50)
    } else if (sessionId) {
      loadAnonMessages(sessionId, false)
    }
  }, [isAuthenticated, loadMoreMessages, loadAnonMessages, sessionId])

  // Get sessions for display
  const displaySessions = isAuthenticated
    ? (sessions || []).map((s) => ({ id: s.sessionId, title: s.title }))
    : anonSessions.map((s) => ({ id: s.sessionId, title: s.title }))

  // Show skeleton while Clerk is loading
  if (!isClerkLoaded) {
    return <ChatSkeleton />
  }

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-64px)] bg-background">
        <ChatSidebar
          isOpen={sidebarOpen}
          sessions={displaySessions}
          activeSessionId={sessionId}
          onNewChat={createNewSession}
          onSelectSession={selectSession}
          onDeleteSession={handleDeleteSession}
          hasMore={isAuthenticated ? sessionsHasMore : anonSessionsHasMore}
          isLoadingMore={isAuthenticated ? isLoadingMoreSessions : false}
          onLoadMore={handleLoadMoreSessions}
        />

        <div className="flex flex-1 flex-col">
          <ChatHeader
            title={sessionId ? 'Chat Session' : 'New Chat'}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />

          <ChatMessages
            messages={allMessages}
            ref={chatMessagesRef}
            hasMore={isAuthenticated ? messagesHasMore : anonMessagesHasMore}
            isLoadingMore={isAuthenticated ? isLoadingMoreMessages : false}
            onLoadMore={handleLoadMoreMessages}
          />

          <ChatInput
            ref={inputRef}
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Rate Limit Modal */}
      <RateLimitModal
        open={rateLimitModalOpen}
        onClose={() => setRateLimitModalOpen(false)}
        isAuthenticated={isAuthenticated}
        limit={rateLimitInfo.limit}
        resetAt={rateLimitInfo.resetAt}
      />
    </TooltipProvider>
  )
}
