import { useRef, useCallback, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Plus, MessageSquare, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Session {
  id: string
  title: string
}

interface ChatSidebarProps {
  isOpen: boolean
  sessions: Session[]
  activeSessionId?: string
  onNewChat: () => void
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string, e: React.MouseEvent) => void
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
}

const SESSION_ITEM_HEIGHT = 44 // Height of each session item in pixels

export function ChatSidebar({
  isOpen,
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: ChatSidebarProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: sessions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => SESSION_ITEM_HEIGHT,
    overscan: 5,
  })

  const virtualItems = virtualizer.getVirtualItems()

  // Load more when scrolling near the bottom
  const handleScroll = useCallback(() => {
    if (!parentRef.current || !onLoadMore || isLoadingMore || !hasMore) return

    const { scrollTop, scrollHeight, clientHeight } = parentRef.current
    const scrollBottom = scrollHeight - scrollTop - clientHeight

    // Load more when within 100px of the bottom
    if (scrollBottom < 100) {
      onLoadMore()
    }
  }, [onLoadMore, isLoadingMore, hasMore])

  useEffect(() => {
    const element = parentRef.current
    if (!element) return

    element.addEventListener('scroll', handleScroll)
    return () => element.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  return (
    <div
      className={cn(
        'flex flex-col border-r border-border bg-muted/30 transition-all duration-300',
        isOpen ? 'w-64' : 'w-0 overflow-hidden',
      )}
    >
      {/* New Chat Button */}
      <div className="p-3">
        <Button
          onClick={onNewChat}
          className="w-full justify-start gap-2"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <Separator />

      {/* Virtualized Sessions List */}
      <div ref={parentRef} className="flex-1 overflow-auto p-2">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualItem) => {
            const session = sessions[virtualItem.index]
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
                <div
                  onClick={() => onSelectSession(session.id)}
                  className={cn(
                    'group flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors',
                    'hover:bg-accent',
                    activeSessionId === session.id && 'bg-accent',
                  )}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate min-w-0">
                    {session.title}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => onDeleteSession(session.id, e)}
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete chat</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            )
          })}
        </div>

        {/* Loading indicator */}
        {isLoadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  )
}
