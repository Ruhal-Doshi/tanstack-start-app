import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

// Get all sessions for a user, ordered by most recent
export const listSessions = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('chatSessions')
      .withIndex('by_user_and_time', (q) => q.eq('userId', args.userId))
      .order('desc')
      .collect()
  },
})

// Get a single session by sessionId
export const getSession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('chatSessions')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .first()
  },
})

// Get all messages for a session, ordered by time
export const getMessages = query({
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

// Create a new chat session
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
    const session = await ctx.db
      .query('chatSessions')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .first()

    if (!session) {
      throw new Error('Session not found')
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
    // Delete all messages in the session
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .collect()

    for (const message of messages) {
      await ctx.db.delete(message._id)
    }

    // Delete the session
    const session = await ctx.db
      .query('chatSessions')
      .withIndex('by_session_id', (q) => q.eq('sessionId', args.sessionId))
      .first()

    if (session) {
      await ctx.db.delete(session._id)
    }
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
