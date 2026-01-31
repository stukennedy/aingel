import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type { Env } from '../../../types'
import { users } from '../../../db/schema'
import { hashPassword, createSession, generateId } from '../../../lib/auth'

export const onRequestPost = async (c: Context<{ Bindings: Env }>) => {
  const { name, email, password } = await c.req.json()

  if (!name || !email || !password) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'datastar-merge-signals',
        data: `signals ${JSON.stringify({ error: 'All fields are required.' })}`
      })
    })
  }

  if (password.length < 8) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'datastar-merge-signals',
        data: `signals ${JSON.stringify({ error: 'Password must be at least 8 characters.' })}`
      })
    })
  }

  const db = drizzle(c.env.DB)

  // Check if user exists
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'datastar-merge-signals',
        data: `signals ${JSON.stringify({ error: 'An account with this email already exists.' })}`
      })
    })
  }

  const id = generateId()
  const passwordHash = await hashPassword(password)

  await db.insert(users).values({
    id,
    email,
    name,
    passwordHash,
    role: 'user',
  })

  await createSession(c, { id, email, name, role: 'user' })

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: 'datastar-execute-script',
      data: `script window.location.href = '/onboarding'`
    })
  })
}
