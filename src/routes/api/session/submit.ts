import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import type { Env } from '../../../types'
import { patients } from '../../../db/schema'
import { generateId } from '../../../lib/auth'

// POST /api/session/submit — validate DO form state + write to D1 patients
export const onRequestPost = async (c: Context<{ Bindings: Env }>) => {
  const user = c.get('user')
  if (!user) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'datastar-merge-signals',
        data: `signals ${JSON.stringify({ formError: 'Not authenticated' })}`
      })
    })
  }

  const id = c.env.SESSION_DO.idFromName(user.id)
  const stub = c.env.SESSION_DO.get(id)
  const res = await stub.fetch(new Request('http://do/submit', { method: 'POST' }))
  const result = await res.json() as { ok: boolean; error?: string; form?: any }

  if (!result.ok) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'datastar-merge-signals',
        data: `signals ${JSON.stringify({ formError: result.error ?? 'Validation failed', submitting: false })}`
      })
    })
  }

  const form = result.form
  const db = drizzle(c.env.DB)

  try {
    // Check if patient already exists for this user
    const existing = await db.select().from(patients).where(eq(patients.userId, user.id)).limit(1)

    if (existing.length > 0) {
      await db.update(patients).set({
        fullName: form.fullName,
        email: form.email || user.email,
        phone: form.phone || null,
        age: form.age ? parseInt(form.age, 10) : null,
        physicalStatus: form.physical || null,
        mentalStatus: form.mental || null,
      }).where(eq(patients.userId, user.id))
    } else {
      await db.insert(patients).values({
        id: generateId(),
        userId: user.id,
        fullName: form.fullName,
        email: form.email || user.email,
        phone: form.phone || null,
        age: form.age ? parseInt(form.age, 10) : null,
        physicalStatus: form.physical || null,
        mentalStatus: form.mental || null,
      })
    }

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'datastar-merge-signals',
        data: `signals ${JSON.stringify({ formError: '', submitting: false, submitted: true })}`
      })
      await stream.writeSSE({
        event: 'datastar-merge-fragments',
        data: `fragments <div id="submit-status" class="submit-success"><span style="font-size:1.5rem">✨</span> Profile saved successfully!</div>`
      })
    })
  } catch (err: any) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'datastar-merge-signals',
        data: `signals ${JSON.stringify({ formError: 'Database error: ' + (err.message ?? 'unknown'), submitting: false })}`
      })
    })
  }
}
