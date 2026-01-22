import { Bot } from 'lucide-react'

export function EmptyChat() {
  return (
    <div className="flex flex-col items-center justify-center h-[50vh] text-center">
      <div className="rounded-full bg-primary/10 p-4 mb-4">
        <Bot className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-xl font-semibold mb-2">How can I help you today?</h2>
      <p className="text-muted-foreground max-w-sm">
        Start a conversation by typing a message below. I'm here to assist with
        your questions.
      </p>
    </div>
  )
}
