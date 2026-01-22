import { QueryCtx, MutationCtx } from './_generated/server'

/**
 * Get the authenticated user's identity from Convex context.
 * Returns the Clerk user ID (subject) if authenticated, null otherwise.
 */
export async function getAuthenticatedUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    return null
  }
  // The subject is the Clerk user ID
  return identity.subject
}

/**
 * Require authentication. Throws if not authenticated.
 */
export async function requireAuth(
  ctx: QueryCtx | MutationCtx,
): Promise<string> {
  const userId = await getAuthenticatedUserId(ctx)
  if (!userId) {
    throw new Error('Unauthorized')
  }
  return userId
}
