import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

// Rate limits per day
const AUTHENTICATED_USER_LIMIT = 10
const ANONYMOUS_USER_LIMIT = 5

// Get today's date in YYYY-MM-DD format (UTC)
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0]
}

// Check if a user/IP has exceeded their rate limit
export const checkRateLimit = query({
  args: {
    identifier: v.string(),
    identifierType: v.union(v.literal('user'), v.literal('ip')),
  },
  handler: async (ctx, args) => {
    const today = getTodayDate()
    const limit =
      args.identifierType === 'user'
        ? AUTHENTICATED_USER_LIMIT
        : ANONYMOUS_USER_LIMIT

    const record = await ctx.db
      .query('rateLimits')
      .withIndex('by_identifier_and_date', (q) =>
        q.eq('identifier', args.identifier).eq('date', today),
      )
      .first()

    const currentCount = record?.messageCount ?? 0
    const remaining = Math.max(0, limit - currentCount)

    return {
      allowed: currentCount < limit,
      limit,
      remaining,
      resetAt: today + 'T23:59:59Z',
    }
  },
})

// Increment the rate limit counter for a user/IP
export const incrementRateLimit = mutation({
  args: {
    identifier: v.string(),
    identifierType: v.union(v.literal('user'), v.literal('ip')),
  },
  handler: async (ctx, args) => {
    const today = getTodayDate()
    const now = Date.now()

    const record = await ctx.db
      .query('rateLimits')
      .withIndex('by_identifier_and_date', (q) =>
        q.eq('identifier', args.identifier).eq('date', today),
      )
      .first()

    if (record) {
      // Update existing record
      await ctx.db.patch(record._id, {
        messageCount: record.messageCount + 1,
        updatedAt: now,
      })
      return { messageCount: record.messageCount + 1 }
    } else {
      // Create new record for today
      await ctx.db.insert('rateLimits', {
        identifier: args.identifier,
        identifierType: args.identifierType,
        date: today,
        messageCount: 1,
        updatedAt: now,
      })
      return { messageCount: 1 }
    }
  },
})

// Get rate limit status (for displaying to user)
export const getRateLimitStatus = query({
  args: {
    identifier: v.string(),
    identifierType: v.union(v.literal('user'), v.literal('ip')),
  },
  handler: async (ctx, args) => {
    const today = getTodayDate()
    const limit =
      args.identifierType === 'user'
        ? AUTHENTICATED_USER_LIMIT
        : ANONYMOUS_USER_LIMIT

    const record = await ctx.db
      .query('rateLimits')
      .withIndex('by_identifier_and_date', (q) =>
        q.eq('identifier', args.identifier).eq('date', today),
      )
      .first()

    const used = record?.messageCount ?? 0
    const remaining = Math.max(0, limit - used)

    return {
      limit,
      used,
      remaining,
      isLimited: remaining === 0,
    }
  },
})
