import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SignInButton } from '@clerk/clerk-react'
import { Clock, LogIn, AlertCircle } from 'lucide-react'

interface RateLimitModalProps {
  open: boolean
  onClose: () => void
  isAuthenticated: boolean
  limit: number
  resetAt?: string
}

export function RateLimitModal({
  open,
  onClose,
  isAuthenticated,
  limit,
  resetAt,
}: RateLimitModalProps) {
  // Calculate time until reset
  const getTimeUntilReset = () => {
    if (!resetAt) return 'tomorrow'
    try {
      const resetDate = new Date(resetAt)
      const now = new Date()
      const hoursLeft = Math.ceil(
        (resetDate.getTime() - now.getTime()) / (1000 * 60 * 60),
      )
      if (hoursLeft <= 1) return 'in about an hour'
      if (hoursLeft < 24) return `in about ${hoursLeft} hours`
      return 'tomorrow'
    } catch {
      return 'tomorrow'
    }
  }

  if (isAuthenticated) {
    // Authenticated user - demo app message
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <DialogTitle className="text-center pt-4">
              Daily Limit Reached
            </DialogTitle>
            <DialogDescription className="text-center">
              You've used all {limit} messages for today. This is a demo
              application with limited daily usage to keep things running
              smoothly for everyone.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Your limit will reset {getTimeUntilReset()}. Come back then to
              continue chatting!
            </p>
          </div>

          <DialogFooter className="sm:justify-center">
            <Button onClick={onClose} className="w-full sm:w-auto">
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Anonymous user - prompt to sign in
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <LogIn className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center pt-4">
            Want More Messages?
          </DialogTitle>
          <DialogDescription className="text-center">
            You've reached the limit of {limit} messages for anonymous users.
            Sign in to get double the messages — it's free!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg bg-muted p-4">
            <h4 className="font-medium text-sm mb-2">
              Benefits of signing in:
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• 10 messages per day (vs 5 for guests)</li>
              <li>• Chat history saved across devices</li>
              <li>• Access your conversations anytime</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <SignInButton mode="modal">
            <Button className="w-full">
              <LogIn className="h-4 w-4 mr-2" />
              Sign in for more messages
            </Button>
          </SignInButton>
          <Button variant="ghost" onClick={onClose} className="w-full">
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
