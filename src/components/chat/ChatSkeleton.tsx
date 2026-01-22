import { Skeleton } from '@/components/ui/skeleton'

export function ChatSkeleton() {
  return (
    <div className="flex h-[calc(100vh-64px)] bg-background">
      {/* Sidebar Skeleton */}
      <div className="flex w-64 flex-col border-r border-border bg-muted/30">
        <div className="p-3">
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="h-px bg-border" />
        <div className="flex-1 p-2 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>

      {/* Main Area Skeleton */}
      <div className="flex flex-1 flex-col">
        {/* Header Skeleton */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-6 w-32" />
        </div>

        {/* Messages Area Skeleton */}
        <div className="flex-1 px-4">
          <div className="mx-auto max-w-3xl py-6 space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Input Area Skeleton */}
        <div className="border-t border-border p-4">
          <div className="mx-auto flex max-w-3xl gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-10" />
          </div>
        </div>
      </div>
    </div>
  )
}
