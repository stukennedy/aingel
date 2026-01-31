export type Env = {
  DB: D1Database
  SESSIONS: KVNamespace
  SESSION_DO: DurableObjectNamespace
  ANAM_API_KEY: string
  ANAM_API_URL: string
}

export type User = {
  id: string
  email: string
  name: string
  role: string
}

declare module 'hono' {
  interface ContextRenderer {
    (content: string | Promise<string>, props?: { title?: string }): Response
  }
  interface ContextVariableMap {
    user: User | null
  }
}
