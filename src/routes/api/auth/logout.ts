import type { Context } from 'hono'
import type { HonoContext } from '@/types'
import { destroySession } from '@/lib/auth'

export const onRequestPost = async (c: Context<HonoContext>) => {
  await destroySession(c)

  c.header('HX-Redirect', '/')
  return c.body(null)
}
