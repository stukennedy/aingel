import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { Env } from '../../../types'

// POST /api/session/form — update a form field via DO, return SSE
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

  const { field, value } = await c.req.json()
  if (!field) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'datastar-merge-signals',
        data: `signals ${JSON.stringify({ formError: 'Missing field name' })}`
      })
    })
  }

  const id = c.env.SESSION_DO.idFromName(user.id)
  const stub = c.env.SESSION_DO.get(id)
  const res = await stub.fetch(new Request('http://do/field', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field, value: value ?? '' }),
  }))
  const result = await res.json() as { ok: boolean; error?: string }

  if (!result.ok) {
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'datastar-merge-signals',
        data: `signals ${JSON.stringify({ formError: result.error ?? 'Update failed' })}`
      })
    })
  }

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: 'datastar-merge-signals',
      data: `signals ${JSON.stringify({ formError: '', [`saved_${field}`]: true })}`
    })
    // Clear saved indicator after a moment (client-side)
    await stream.writeSSE({
      event: 'datastar-execute-script',
      data: `script setTimeout(() => document.querySelector('#save-${field}')?.classList.remove('visible'), 1500)`
    })
    await stream.writeSSE({
      event: 'datastar-merge-fragments',
      data: `fragments <span id="save-${field}" class="save-indicator visible">✓ saved</span>`
    })
  })
}
