import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { PanelLeftClose, PanelLeft } from 'lucide-react'

interface ChatHeaderProps {
  title: string
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function ChatHeader({
  title,
  sidebarOpen,
  onToggleSidebar,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onToggleSidebar}>
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
      <h1 className="font-semibold">{title}</h1>
    </div>
  )
}
