import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type { Env } from '../../../types'
import { users } from '../../../db/schema'
import { hashPassword, createSession } from '../../../lib/auth'

export const onRequestPost = async (c: Context<{ Bindings: Env }>) => {
  const { email, password } = await c.req.json()

  if (!email || !password) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'datastar-merge-signals',
        data: `signals ${JSON.stringify({ error: 'Email and password are required.' })}`
      })
    })
  }

  const db = drizzle(c.env.DB)
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)

  if (!user) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'datastar-merge-signals',
        data: `signals ${JSON.stringify({ error: 'Invalid email or password.' })}`
      })
    })
  }

  const hash = await hashPassword(password)
  if (hash !== user.passwordHash) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'datastar-merge-signals',
        data: `signals ${JSON.stringify({ error: 'Invalid email or password.' })}`
      })
    })
  }

  await createSession(c, {
    id: user.id,
    email: user.email,
    name: user.name ?? '',
    role: user.role ?? 'user',
  })

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: 'datastar-execute-script',
      data: `script window.location.href = '/onboarding'`
    })
  })
}
