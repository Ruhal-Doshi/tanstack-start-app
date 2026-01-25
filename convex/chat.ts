import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from './_generated/server'
import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { getAuthenticatedUserId } from './auth'

// ============================================
// PUBLIC QUERIES (called from client, require auth)
// ============================================

// Get all sessions for a user, ordered by most recent (legacy, fetches all)
export const listSessions = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    // Verify the authenticated user matches the requested userId
    const authUserId = await getAuthenticatedUserId(ctx)
    if (!authUserId || authUserId !== args.userId) {
      return []
    }
    return await ctx.db
      .query('chatSessions')
      .withIndex('by_user_and_time', (q) => q.eq('userId', args.userId))
      .order('desc')
      .collect()
  },
})

// Paginated sessions query - compatible with usePaginatedQuery
export const listSessionsPaginated = query({
  args: {
    userId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const authUserId = await getAuthenticatedUserId(ctx)
    if (!authUserId || authUserId !== args.userId) {
      // Return empty paginated result
      return {
        page: [],
        isDone: true,
        continueCursor: '',
      }
    }

    return await ctx.db
      .query('chatSessions')
      .withIndex('by_user_and_time', (q) => q.eq('userId', args.userId))
      .order('desc')
      .paginate(args.paginationOpts)
  },
})

// Get a single session by sessionId
export const getSession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const authUserId = await getAuthenticatedUserId(ctx)
    if (!authUserId) {
      return null
    }
    const session = await ctx.db
      .query('chatSessions')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .first()
    // Only return if session belongs to authenticated user
    if (session && session.userId !== authUserId) {
      return null
    }
    return session
  },
})

// Get all messages for a session, ordered by time (client-facing, requires auth)
export const getMessages = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const authUserId = await getAuthenticatedUserId(ctx)
    if (!authUserId) {
      return []
    }
    // Verify session belongs to authenticated user
    const session = await ctx.db
      .query('chatSessions')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .first()
    if (!session || session.userId !== authUserId) {
      return []
    }
    return await ctx.db
      .query('chatMessages')
      .withIndex('by_session_and_time', (q) =>
        q.eq('sessionId', args.sessionId),
      )
      .order('asc')
      .collect()
  },
})

// Paginated messages query - compatible with usePaginatedQuery
// Note: Convex pagination always returns in query order, so we query desc (newest first)
// and the client will reverse if needed for display
export const getMessagesPaginated = query({
  args: {
    sessionId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const authUserId = await getAuthenticatedUserId(ctx)
    if (!authUserId) {
      return {
        page: [],
        isDone: true,
        continueCursor: '',
      }
    }

    const session = await ctx.db
      .query('chatSessions')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .first()

    if (!session || session.userId !== authUserId) {
      return {
        page: [],
        isDone: true,
        continueCursor: '',
      }
    }

    // Query in ascending order (chronological) for chat display
    return await ctx.db
      .query('chatMessages')
      .withIndex('by_session_and_time', (q) =>
        q.eq('sessionId', args.sessionId),
      )
      .order('asc')
      .paginate(args.paginationOpts)
  },
})

// ============================================
// INTERNAL QUERIES/MUTATIONS (called from server, no client auth)
// These are only callable from other Convex functions or via internal API
// The server already verifies the Clerk JWT before calling these
// ============================================

// Internal: Get messages for a session (server-side use)
export const internalGetMessages = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('chatMessages')
      .withIndex('by_session_and_time', (q) =>
        q.eq('sessionId', args.sessionId),
      )
      .order('asc')
      .collect()
  },
})

// Internal: Create a new chat session (server-side use)
export const internalCreateSession = internalMutation({
  args: {
    sessionId: v.string(),
    userId: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    return await ctx.db.insert('chatSessions', {
      sessionId: args.sessionId,
      userId: args.userId,
      title: args.title,
      createdAt: now,
      updatedAt: now,
    })
  },
})

// Internal: Add a message to a session (server-side use)
export const internalAddMessage = internalMutation({
  args: {
    sessionId: v.string(),
    messageId: v.string(),
    role: v.union(v.literal('user'), v.literal('assistant')),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    // Update session's updatedAt timestamp
    const session = await ctx.db
      .query('chatSessions')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .first()

    if (session) {
      await ctx.db.patch(session._id, { updatedAt: now })
    }

    // Insert the message
    return await ctx.db.insert('chatMessages', {
      sessionId: args.sessionId,
      messageId: args.messageId,
      role: args.role,
      content: args.content,
      createdAt: now,
    })
  },
})

// ============================================
// PUBLIC MUTATIONS (called from client, require auth where needed)
// ============================================

// Create a new chat session (public, called from server after JWT verification)
export const createSession = mutation({
  args: {
    sessionId: v.string(),
    userId: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    return await ctx.db.insert('chatSessions', {
      sessionId: args.sessionId,
      userId: args.userId,
      title: args.title,
      createdAt: now,
      updatedAt: now,
    })
  },
})

// Update session title or timestamp
export const updateSession = mutation({
  args: {
    sessionId: v.string(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Require authentication
    const authUserId = await getAuthenticatedUserId(ctx)
    if (!authUserId) {
      throw new Error('Unauthorized')
    }

    const session = await ctx.db
      .query('chatSessions')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .first()

    if (!session) {
      throw new Error('Session not found')
    }
    if (session.userId !== authUserId) {
      throw new Error('Unauthorized')
    }

    return await ctx.db.patch(session._id, {
      ...(args.title && { title: args.title }),
      updatedAt: Date.now(),
    })
  },
})

// Delete a session and all its messages
export const deleteSession = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    // Require authentication for client-side delete
    const authUserId = await getAuthenticatedUserId(ctx)
    if (!authUserId) {
      throw new Error('Unauthorized')
    }

    // Verify session belongs to authenticated user
    const session = await ctx.db
      .query('chatSessions')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .first()

    if (!session) {
      throw new Error('Session not found')
    }
    if (session.userId !== authUserId) {
      throw new Error('Unauthorized')
    }

    // Delete all messages in the session
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .collect()

    for (const message of messages) {
      await ctx.db.delete(message._id)
    }

    // Delete the session
    await ctx.db.delete(session._id)
  },
})

// Add a message to a session
export const addMessage = mutation({
  args: {
    sessionId: v.string(),
    messageId: v.string(), // Client-generated ID for deduplication
    role: v.union(v.literal('user'), v.literal('assistant')),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    // Update session's updatedAt timestamp
    const session = await ctx.db
      .query('chatSessions')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .first()

    if (session) {
      await ctx.db.patch(session._id, { updatedAt: now })
    }

    // Insert the message
    return await ctx.db.insert('chatMessages', {
      sessionId: args.sessionId,
      messageId: args.messageId,
      role: args.role,
      content: args.content,
      createdAt: now,
    })
  },
})

// Add multiple messages at once (useful for saving user + assistant pair)
export const addMessages = mutation({
  args: {
    sessionId: v.string(),
    messages: v.array(
      v.object({
        messageId: v.string(),
        role: v.union(v.literal('user'), v.literal('assistant')),
        content: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    // Update session's updatedAt timestamp
    const session = await ctx.db
      .query('chatSessions')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .first()

    if (session) {
      await ctx.db.patch(session._id, { updatedAt: now })
    }

    // Insert all messages
    for (let i = 0; i < args.messages.length; i++) {
      const msg = args.messages[i]
      await ctx.db.insert('chatMessages', {
        sessionId: args.sessionId,
        messageId: msg.messageId,
        role: msg.role,
        content: msg.content,
        createdAt: now + i, // Ensure ordering
      })
    }
  },
})
