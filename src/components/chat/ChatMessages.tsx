import {
  forwardRef,
  useRef,
  useCallback,
  useEffect,
  useImperativeHandle,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bot, User, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyChat } from './EmptyChat'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  isStreaming?: boolean
}

interface ChatMessagesProps {
  messages: ChatMessage[]
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
}

export interface ChatMessagesHandle {
  scrollToBottom: () => void
}

// Estimate height based on content length (rough approximation)
function estimateMessageHeight(message: ChatMessage): number {
  // Base height for avatar, name, padding
  const baseHeight = 80
  // Estimate ~80 chars per line, ~24px per line
  const lineCount = Math.ceil(message.content.length / 80)
  const contentHeight = Math.max(24, lineCount * 24)
  return baseHeight + contentHeight
}

export const ChatMessages = forwardRef<ChatMessagesHandle, ChatMessagesProps>(
  ({ messages, hasMore = false, isLoadingMore = false, onLoadMore }, ref) => {
    const parentRef = useRef<HTMLDivElement>(null)
    const isScrolledToBottomRef = useRef(true)

    const virtualizer = useVirtualizer({
      count: messages.length,
      getScrollElement: () => parentRef.current,
      estimateSize: (index) => estimateMessageHeight(messages[index]),
      overscan: 5,
      // Keep scroll position at bottom for chat
      getItemKey: (index) => messages[index].id,
    })

    const virtualItems = virtualizer.getVirtualItems()

    // Scroll to bottom function
    const scrollToBottom = useCallback(() => {
      if (messages.length > 0) {
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end' })
      }
    }, [virtualizer, messages.length])

    // Expose scrollToBottom to parent
    useImperativeHandle(ref, () => ({
      scrollToBottom,
    }))

    // Track if user is at bottom
    const handleScroll = useCallback(() => {
      if (!parentRef.current) return

      const { scrollTop, scrollHeight, clientHeight } = parentRef.current
      const scrollBottom = scrollHeight - scrollTop - clientHeight

      // Consider "at bottom" if within 50px
      isScrolledToBottomRef.current = scrollBottom < 50

      // Load more when scrolling near the top
      if (onLoadMore && !isLoadingMore && hasMore && scrollTop < 100) {
        onLoadMore()
      }
    }, [onLoadMore, isLoadingMore, hasMore])

    useEffect(() => {
      const element = parentRef.current
      if (!element) return

      element.addEventListener('scroll', handleScroll)
      return () => element.removeEventListener('scroll', handleScroll)
    }, [handleScroll])

    // Auto-scroll to bottom when new messages arrive (if user was at bottom)
    useEffect(() => {
      if (isScrolledToBottomRef.current && messages.length > 0) {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          scrollToBottom()
        })
      }
    }, [messages.length, scrollToBottom])

    // Initial scroll to bottom
    useEffect(() => {
      if (messages.length > 0) {
        scrollToBottom()
      }
    }, []) // Only on mount

    if (messages.length === 0) {
      return (
        <div className="flex-1 overflow-auto px-4">
          <div className="mx-auto max-w-3xl py-6">
            <EmptyChat />
          </div>
        </div>
      )
    }

    return (
      <div ref={parentRef} className="flex-1 overflow-auto px-4">
        <div className="mx-auto max-w-3xl py-6">
          {/* Loading indicator for older messages */}
          {isLoadingMore && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Virtualized messages container */}
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualItem) => {
              const message = messages[virtualItem.index]
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <div className="flex gap-3 py-3">
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
                    <div className="flex-1 space-y-1 min-w-0">
                      <p className="text-sm font-medium">
                        {message.role === 'assistant' ? 'Assistant' : 'You'}
                      </p>
                      <div className="text-sm text-foreground/90">
                        {message.role === 'assistant' ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-muted prose-pre:p-3 prose-pre:rounded-lg prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content}
                            </ReactMarkdown>
                            {message.isStreaming && (
                              <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />
                            )}
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap wrap-break-word">
                            {message.content}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  },
)

ChatMessages.displayName = 'ChatMessages'
