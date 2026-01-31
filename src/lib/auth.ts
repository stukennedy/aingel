import { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Env, User } from '../types'

const SESSION_TTL = 60 * 60 * 24 * 7 // 7 days

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function createSession(c: Context<{ Bindings: Env }>, user: User): Promise<string> {
  const sessionId = crypto.randomUUID()
  await c.env.SESSIONS.put(
    `session:${sessionId}`,
    JSON.stringify(user),
    { expirationTtl: SESSION_TTL }
  )
  setCookie(c, 'session', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL,
  })
  return sessionId
}

export async function destroySession(c: Context<{ Bindings: Env }>): Promise<void> {
  const sessionId = getCookie(c, 'session')
  if (sessionId) {
    await c.env.SESSIONS.delete(`session:${sessionId}`)
    deleteCookie(c, 'session', { path: '/' })
  }
}

export const authMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const sessionId = getCookie(c, 'session')
  if (sessionId) {
    const data = await c.env.SESSIONS.get(`session:${sessionId}`)
    if (data) {
      c.set('user', JSON.parse(data) as User)
    }
  }
  if (!c.get('user')) {
    c.set('user', null)
  }
  await next()
}

export const requireAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (!c.get('user')) {
    return c.redirect('/login')
  }
  await next()
}

export function generateId(): string {
  return crypto.randomUUID()
}
