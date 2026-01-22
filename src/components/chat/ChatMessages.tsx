import { forwardRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bot, User } from 'lucide-react'
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
}

export const ChatMessages = forwardRef<HTMLDivElement, ChatMessagesProps>(
  ({ messages }, ref) => {
    if (messages.length === 0) {
      return (
        <ScrollArea className="flex-1 px-4">
          <div className="mx-auto max-w-3xl py-6">
            <EmptyChat />
          </div>
        </ScrollArea>
      )
    }

    return (
      <ScrollArea className="flex-1 px-4">
        <div className="mx-auto max-w-3xl py-6">
          <div className="space-y-6">
            {messages.map((message) => (
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
                      <div className="whitespace-pre-wrap">
                        {message.content}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={ref} />
          </div>
        </div>
      </ScrollArea>
    )
  },
)

ChatMessages.displayName = 'ChatMessages'
