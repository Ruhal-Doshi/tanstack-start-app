import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useRef, useEffect, useMemo } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Send,
  Plus,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  Bot,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import { useAuth } from '@clerk/clerk-react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'

// Search params schema
const chatSearchSchema = z.object({
  sessionId: z.string().optional(),
})

export const Route = createFileRoute('/')({
  validateSearch: chatSearchSchema,
  component: ChatPage,
})

// Generate or retrieve anonymous user ID from localStorage
function getAnonymousUserId(): string {
  const STORAGE_KEY = 'anonymous_user_id'
  let userId = localStorage.getItem(STORAGE_KEY)
  if (!userId) {
    userId = `anon_${crypto.randomUUID()}`
    localStorage.setItem(STORAGE_KEY, userId)
  }
  return userId
}

function ChatPage() {
  const navigate = useNavigate()
  const { sessionId } = Route.useSearch()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Get auth token from Clerk and anonymous ID from localStorage
  const { getToken, userId: clerkUserId } = useAuth()
  const [anonymousId, setAnonymousId] = useState<string | null>(null)

  useEffect(() => {
    // Get anonymous ID from localStorage on client side
    setAnonymousId(getAnonymousUserId())
  }, [])

  // For Convex queries, use clerk userId if available, otherwise anonymous
  const currentUserId = clerkUserId || anonymousId

  // Convex queries and mutations
  const sessions = useQuery(
    api.chat.listSessions,
    currentUserId ? { userId: currentUserId } : 'skip',
  )
  const storedMessages = useQuery(
    api.chat.getMessages,
    sessionId ? { sessionId } : 'skip',
  )
  const deleteSessionMutation = useMutation(api.chat.deleteSession)

  // Track session ID in a ref so callbacks can access the updated value
  const sessionIdRef = useRef<string | undefined>(sessionId)
  // Track current message IDs for deduplication
  const currentUserMessageIdRef = useRef<string | null>(null)
  const currentAssistantMessageIdRef = useRef<string | null>(null)
  // Track pending session ID from metadata chunk (for URL navigation)
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null)

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
      // Get fresh auth token for each request
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      return {
        headers,
        body: {
          // Use ref to get current sessionId (avoids stale closure)
          sessionId: sessionIdRef.current,
          anonymousId, // Send anonymous ID for non-auth users
          userMessageId: currentUserMessageIdRef.current, // For deduplication
        },
      }
    }),
    onChunk: (chunk: unknown) => {
      // Check if this is a metadata chunk with message IDs and session ID
      const metaChunk = chunk as {
        type?: string
        metadata?: {
          sessionId?: string
          userMessageId?: string
          assistantMessageId?: string
        }
      }
      if (metaChunk?.type === 'metadata') {
        // Capture message IDs for deduplication
        if (metaChunk.metadata?.userMessageId) {
          currentUserMessageIdRef.current = metaChunk.metadata.userMessageId
        }
        if (metaChunk.metadata?.assistantMessageId) {
          currentAssistantMessageIdRef.current =
            metaChunk.metadata.assistantMessageId
        }
        // Handle new session navigation
        const newSessionId = metaChunk.metadata?.sessionId
        if (newSessionId && !sessionIdRef.current) {
          sessionIdRef.current = newSessionId
          setPendingSessionId(newSessionId)
        }
      }
    },
    onFinish: () => {
      // Clear useChat messages after streaming completes
      // Convex will have all messages, so we show those instead
      clearMessages()
      // Reset message ID refs
      currentUserMessageIdRef.current = null
      currentAssistantMessageIdRef.current = null
    },
  })

  // Wrap sendMessage to generate userMessageId before sending
  const sendMessage = (content: string) => {
    currentUserMessageIdRef.current = crypto.randomUUID()
    return originalSendMessage(content)
  }

  // Combine Convex messages with the currently streaming message only
  const allMessages = useMemo(() => {
    // Start with stored messages from Convex (source of truth)
    const convexMsgs: Array<{
      id: string
      role: 'user' | 'assistant'
      content: string
      createdAt: number
      isStreaming?: boolean
    }> = (storedMessages || []).map((msg) => ({
      id: msg.messageId, // Use messageId for React key and deduplication
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      createdAt: msg.createdAt,
      isStreaming: false,
    }))

    // During streaming, add useChat messages that aren't in Convex yet
    if (isLoading && messages.length > 0) {
      // Get max timestamp from Convex
      const maxConvexTimestamp = Math.max(
        0,
        ...convexMsgs.map((m) => m.createdAt),
      )

      // Check if Convex has the user message by messageId
      const hasUserMessage = currentUserMessageIdRef.current
        ? convexMsgs.some((m) => m.id === currentUserMessageIdRef.current)
        : false

      // Show user message from useChat if Convex doesn't have it yet
      if (!hasUserMessage) {
        const userMsg = messages.find((m) => m.role === 'user')
        if (userMsg) {
          const content = getMessageContent(userMsg)
          convexMsgs.push({
            id: currentUserMessageIdRef.current || userMsg.id,
            role: 'user',
            content,
            createdAt: maxConvexTimestamp + 1,
            isStreaming: false,
          })
        }
      }

      // Check if Convex has the assistant message by messageId
      const hasAssistantMessage = currentAssistantMessageIdRef.current
        ? convexMsgs.some((m) => m.id === currentAssistantMessageIdRef.current)
        : false

      // Add the streaming assistant message if Convex doesn't have it
      if (!hasAssistantMessage) {
        const assistantMsg = messages.find((m) => m.role === 'assistant')
        if (assistantMsg) {
          const content = getMessageContent(assistantMsg)
          // Recalculate max after potentially adding user message
          const newMaxTimestamp = Math.max(
            maxConvexTimestamp,
            ...convexMsgs.map((m) => m.createdAt),
          )
          convexMsgs.push({
            id: currentAssistantMessageIdRef.current || assistantMsg.id,
            role: 'assistant',
            content,
            createdAt: newMaxTimestamp + 1,
            isStreaming: true,
          })
        }
      }
    }

    // Sort by createdAt to ensure correct order
    convexMsgs.sort((a, b) => a.createdAt - b.createdAt)

    return convexMsgs
  }, [storedMessages, messages, isLoading])

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
    navigate({
      to: '/',
      search: {},
    })
  }

  const selectSession = (id: string) => {
    clearMessages()
    navigate({
      to: '/',
      search: { sessionId: id },
    })
  }

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteSessionMutation({ sessionId: id })
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

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-64px)] bg-background">
        {/* Sidebar */}
        <div
          className={cn(
            'flex flex-col border-r border-border bg-muted/30 transition-all duration-300',
            sidebarOpen ? 'w-64' : 'w-0 overflow-hidden',
          )}
        >
          {/* New Chat Button */}
          <div className="p-3">
            <Button
              onClick={createNewSession}
              className="w-full justify-start gap-2"
              variant="outline"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
          </div>

          <Separator />

          {/* Sessions List */}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {sessions?.map((session) => (
                <div
                  key={session.sessionId}
                  onClick={() => selectSession(session.sessionId)}
                  className={cn(
                    'group flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors',
                    'hover:bg-accent',
                    sessionId === session.sessionId && 'bg-accent',
                  )}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{session.title}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) =>
                          handleDeleteSession(session.sessionId, e)
                        }
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete chat</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Main Chat Area */}
        <div className="flex flex-1 flex-col">
          {/* Chat Header */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                  {sidebarOpen ? (
                    <PanelLeftClose className="h-5 w-5" />
                  ) : (
                    <PanelLeft className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              </TooltipContent>
            </Tooltip>
            <h1 className="font-semibold">
              {sessionId ? 'Chat Session' : 'New Chat'}
            </h1>
          </div>

          {/* Messages Area */}
          <ScrollArea className="flex-1 px-4">
            <div className="mx-auto max-w-3xl py-6">
              {allMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[50vh] text-center">
                  <div className="rounded-full bg-primary/10 p-4 mb-4">
                    <Bot className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">
                    How can I help you today?
                  </h2>
                  <p className="text-muted-foreground max-w-sm">
                    Start a conversation by typing a message below. I'm here to
                    assist with your questions.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {allMessages.map((message) => (
                    <div key={message.id} className="flex gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback
                          className={cn(
                            message.role === 'assistant'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted',
                          )}
                        >
                          {message.role === 'assistant' ? (
                            <Bot className="h-4 w-4" />
                          ) : (
                            <User className="h-4 w-4" />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium">
                          {message.role === 'assistant' ? 'Assistant' : 'You'}
                        </p>
                        <div className="text-sm text-foreground/90 whitespace-pre-wrap">
                          {message.content}
                          {message.isStreaming && (
                            <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t border-border p-4">
            <form
              onSubmit={handleSubmit}
              className="mx-auto flex max-w-3xl gap-2"
            >
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type your message..."
                disabled={isLoading}
                className="flex-1"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!inputValue.trim() || isLoading}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send message</TooltipContent>
              </Tooltip>
            </form>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              AI can make mistakes. Please verify important information.
            </p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
