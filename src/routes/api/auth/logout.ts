import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { Env } from '../../../types'
import { destroySession } from '../../../lib/auth'

export const onRequestPost = async (c: Context<{ Bindings: Env }>) => {
  await destroySession(c)

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: 'datastar-execute-script',
      data: `script window.location.href = '/'`
    })
  })
}
