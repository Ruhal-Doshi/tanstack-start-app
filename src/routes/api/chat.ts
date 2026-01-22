import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { createFileRoute } from '@tanstack/react-router'
import { ConvexHttpClient } from 'convex/browser'
import { verifyToken } from '@clerk/backend'
import { api } from '../../../convex/_generated/api'

// Create Convex HTTP client for server-side queries
const convexUrl = process.env.CONVEX_URL
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Check for API key
        if (!process.env.OPENAI_API_KEY) {
          return new Response(
            JSON.stringify({
              error: 'OPENAI_API_KEY not configured',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        // Get user ID from auth token or use anonymous ID
        let userId: string | null = null
        const authHeader = request.headers.get('Authorization')
        if (authHeader?.startsWith('Bearer ') && process.env.CLERK_SECRET_KEY) {
          try {
            const token = authHeader.slice(7)
            const payload = await verifyToken(token, {
              secretKey: process.env.CLERK_SECRET_KEY,
            })
            userId = payload.sub
          } catch {
            // Token verification failed, will use anonymous ID
          }
        }

        const body = await request.json()
        const {
          messages,
          sessionId,
          anonymousId,
          userMessageId,
          isAnonymous,
          messageHistory,
        } = body

        // For anonymous users, we don't use Convex at all
        const isAnon = isAnonymous === true

        // Use authenticated user ID or anonymous ID
        const currentUserId = userId || anonymousId
        if (!currentUserId) {
          return new Response(
            JSON.stringify({ error: 'User identification required' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        }

        // Generate a new session ID if not provided
        const currentSessionId = sessionId || crypto.randomUUID()
        const isNewSession = !sessionId

        // Generate message IDs
        const currentUserMessageId = userMessageId || crypto.randomUUID()
        const assistantMessageId = crypto.randomUUID()

        // Get the latest user message (the one being sent now)
        const latestUserMessage = messages[messages.length - 1]
        const userMessageContent =
          latestUserMessage?.role === 'user'
            ? (latestUserMessage.parts?.find(
                (p: { type: string }) => p.type === 'text',
              )?.content ??
              latestUserMessage.content ??
              '')
            : ''

        try {
          // For authenticated users: use Convex
          // For anonymous users: skip Convex entirely

          if (!isAnon && convex) {
            // Create session in Convex for new sessions
            if (isNewSession) {
              await convex.mutation(api.chat.createSession, {
                sessionId: currentSessionId,
                userId: currentUserId,
                title: userMessageContent.slice(0, 50) || 'New Chat',
              })
            }

            // Save the user message to Convex immediately
            if (userMessageContent) {
              await convex.mutation(api.chat.addMessage, {
                sessionId: currentSessionId,
                messageId: currentUserMessageId,
                role: 'user',
                content: userMessageContent,
              })
            }
          }

          // Determine messages to use for context
          let allMessages: Array<{
            role: 'user' | 'assistant'
            content: string
          }> = []

          if (isAnon) {
            // For anonymous users, use the message history passed from client
            // Plus add the current user message
            allMessages = [
              ...(messageHistory || []),
              { role: 'user' as const, content: userMessageContent },
            ]
          } else if (convex) {
            // For authenticated users, fetch from Convex
            const convexMessages = await convex.query(api.chat.getMessages, {
              sessionId: currentSessionId,
            })
            allMessages = convexMessages.map((msg) => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
            }))
          }

          // Create a streaming chat response
          const chatStream = chat({
            adapter: openaiText('gpt-4o-mini'),
            messages: allMessages,
            conversationId: currentSessionId,
          })

          // Collect the full response to save to Convex
          let fullResponse = ''

          // Create a custom stream that includes session metadata and saves response
          async function* streamWithMeta() {
            // Yield session metadata first for new sessions as a special chunk
            if (isNewSession) {
              yield {
                type: 'metadata',
                metadata: {
                  sessionId: currentSessionId,
                  userMessageId: currentUserMessageId,
                  assistantMessageId,
                },
              }
            } else {
              // Always send message IDs for deduplication
              yield {
                type: 'metadata',
                metadata: {
                  userMessageId: currentUserMessageId,
                  assistantMessageId,
                },
              }
            }
            // Yield all chat chunks and collect the response
            for await (const chunk of chatStream) {
              // Collect text content from chunks
              if (chunk.type === 'content' && chunk.delta) {
                fullResponse += chunk.delta
              }
              yield chunk
            }
            // Save the assistant response to Convex after streaming completes
            // Only for authenticated users (not anonymous)
            if (!isAnon && convex && fullResponse) {
              await convex.mutation(api.chat.addMessage, {
                sessionId: currentSessionId,
                messageId: assistantMessageId,
                role: 'assistant',
                content: fullResponse,
              })
            }
          }

          return toServerSentEventsResponse(streamWithMeta())
        } catch (error) {
          return new Response(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : 'An error occurred',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
