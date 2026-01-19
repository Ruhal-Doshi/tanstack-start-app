import { Link } from '@tanstack/react-router'
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'

export default function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-3 bg-gray-800 text-white shadow-lg">
      <h1 className="text-xl font-semibold">
        <Link to="/">
          <img
            src="/tanstack-word-logo-white.svg"
            alt="TanStack Logo"
            className="h-8"
          />
        </Link>
      </h1>
      <div className="flex items-center gap-2">
        <SignedOut>
          <SignInButton>
            <Button
              variant="outline"
              size="sm"
              className="bg-transparent text-white border-white hover:bg-white/10 hover:text-white"
            >
              Sign In
            </Button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </header>
  )
}
