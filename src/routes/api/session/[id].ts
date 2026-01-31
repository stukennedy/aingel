import type { Context } from 'hono'
import type { Env } from '@/types'

// GET /api/session/:id — debug endpoint to view DO form state
export const onRequestGet = async (c: Context<{ Bindings: Env }>) => {
  const user = c.get('user')
  if (!user) return c.json({ error: 'Not authenticated' }, 401)

  const userId = c.req.param('id') || user.id
  const id = c.env.SESSION_DO.idFromName(userId)
  const stub = c.env.SESSION_DO.get(id)
  const res = await stub.fetch(new Request('http://do/state'))
  const data = await res.json()
  return c.json(data)
}
