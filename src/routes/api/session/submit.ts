import type { Context } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import type { Env } from '@/types'
import { patients } from '@/db/schema'
import { generateId } from '@/lib/auth'

export const onRequestPost = async (c: Context<{ Bindings: Env }>) => {
  const user = c.get('user')
  if (!user) {
    return c.html('Not authenticated')
  }

  const id = c.env.SESSION_DO.idFromName(user.id)
  const stub = c.env.SESSION_DO.get(id)
  const res = await stub.fetch(new Request('http://do/submit', { method: 'POST' }))
  const result = await res.json() as { ok: boolean; error?: string; form?: any }

  if (!result.ok) {
    return c.html(`<p class="form-error">${result.error ?? 'Validation failed'}</p>`)
  }

  const form = result.form
  const db = drizzle(c.env.DB)

  try {
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

    return c.html('<div class="submit-success"><span style="font-size:1.5rem">✨</span> Profile saved successfully!</div>')
  } catch (err: any) {
    return c.html(`<p class="form-error">Database error: ${err.message ?? 'unknown'}</p>`)
  }
}
