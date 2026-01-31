import { Hono } from 'hono'
import type { Env } from './types'
import { layout } from './routes/Layout'
import { authMiddleware } from './lib/auth'
import { loadRoutes } from './router'

const app = new Hono<{ Bindings: Env }>()

// Global middleware
app.use('*', layout)
app.use('*', authMiddleware)

// File-based routes
loadRoutes(app)

// Durable Objects
export { SessionDO } from './do/session'

export default app
