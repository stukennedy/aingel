import type { Context } from 'hono'
import type { Env } from '@/types'

// POST /api/session/debug — manually set fields (for testing without AI)
// Body: { fields: { fullName: "...", age: "32", ... } }
export const onRequestPost = async (c: Context<{ Bindings: Env }>) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'Not authenticated' }, 401)

  const { fields } = await c.req.json() as { fields: Record<string, string> }
  if (!fields || typeof fields !== 'object') {
    return c.json({ error: 'Provide { fields: { ... } }' }, 400)
  }

  const id = c.env.SESSION_DO.idFromName(user.id)
  const stub = c.env.SESSION_DO.get(id)

  const results: Record<string, boolean> = {}
  for (const [field, value] of Object.entries(fields)) {
    const res = await stub.fetch(new Request('http://do/field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    }))
    const r = await res.json() as { ok: boolean }
    results[field] = r.ok
  }

  // Return updated state
  const stateRes = await stub.fetch(new Request('http://do/state'))
  const state = await stateRes.json()
  return c.json({ ok: true, updated: results, ...(state as Record<string, unknown>) })
}
