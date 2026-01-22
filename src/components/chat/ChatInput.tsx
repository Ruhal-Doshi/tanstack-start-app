import { forwardRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Send } from 'lucide-react'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
  isLoading: boolean
}

export const ChatInput = forwardRef<HTMLInputElement, ChatInputProps>(
  ({ value, onChange, onSubmit, isLoading }, ref) => {
    return (
      <div className="border-t border-border p-4">
        <form onSubmit={onSubmit} className="mx-auto flex max-w-3xl gap-2">
          <Input
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="submit"
                size="icon"
                disabled={!value.trim() || isLoading}
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
    )
  },
)

ChatInput.displayName = 'ChatInput'
