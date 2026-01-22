import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useRef, useEffect, useMemo } from 'react'
import { z } from 'zod'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import { useAuth } from '@clerk/clerk-react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import {
  ChatSidebar,
  ChatMessages,
  ChatInput,
  ChatHeader,
  ChatSkeleton,
  type ChatMessage,
} from '@/components/chat'
import {
  type AnonSession,
  type AnonMessage,
  getAnonymousUserId,
  getAnonSessions,
  getAnonMessages,
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Get auth token from Clerk
  const { getToken, userId: clerkUserId, isLoaded: isClerkLoaded } = useAuth()
  const isAuthenticated = !!clerkUserId

  // For anonymous users, manage sessions/messages in localStorage
  const [anonSessions, setAnonSessions] = useState<AnonSession[]>([])
  const [anonMessages, setAnonMessages] = useState<AnonMessage[]>([])

  // Load anonymous data from localStorage
  useEffect(() => {
    if (!isAuthenticated) {
      setAnonSessions(getAnonSessions())
      if (sessionId) {
        setAnonMessages(getAnonMessages(sessionId))
      } else {
        setAnonMessages([])
      }
    }
  }, [isAuthenticated, sessionId])

  // Convex queries and mutations (only for authenticated users)
  const convexSessions = useQuery(
    api.chat.listSessions,
    isAuthenticated && clerkUserId ? { userId: clerkUserId } : 'skip',
  )
  const convexMessages = useQuery(
    api.chat.getMessages,
    isAuthenticated && sessionId ? { sessionId } : 'skip',
  )
  const deleteSessionMutation = useMutation(api.chat.deleteSession)

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
  isAuthenticatedRef.current = isAuthenticated

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
      // For anonymous users: from localStorage
      // For authenticated users: from Convex (already loaded via useQuery)
      let messageHistory: Array<{ role: string; content: string }> = []
      if (!isAuthenticatedRef.current && sessionIdRef.current) {
        // Anonymous: get from localStorage
        const anonMsgs = getAnonMessages(sessionIdRef.current)
        messageHistory = anonMsgs.map((m) => ({
          role: m.role,
          content: m.content,
        }))
      } else if (isAuthenticatedRef.current && storedMessages) {
        // Authenticated: use Convex messages already loaded
        messageHistory = storedMessages.map((m) => ({
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
  })

  // Wrap sendMessage to generate userMessageId and track content
  const sendMessage = (content: string) => {
    currentUserMessageIdRef.current = crypto.randomUUID()
    pendingUserMessageRef.current = content
    return originalSendMessage(content)
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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [allMessages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [sessionId])

  const createNewSession = () => {
    clearMessages()
    navigate({ to: '/', search: {} })
  }

  const selectSession = (id: string) => {
    clearMessages()
    navigate({ to: '/', search: { sessionId: id } })
  }

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (isAuthenticated) {
      await deleteSessionMutation({ sessionId: id })
    } else {
      deleteAnonSession(id)
      setAnonSessions(getAnonSessions())
      setAnonMessages(getAnonMessages(sessionId || ''))
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
        />

        <div className="flex flex-1 flex-col">
          <ChatHeader
            title={sessionId ? 'Chat Session' : 'New Chat'}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />

          <ChatMessages messages={allMessages} ref={messagesEndRef} />

          <ChatInput
            ref={inputRef}
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />
        </div>
      </div>
    </TooltipProvider>
  )
}
