export type Env = {
  DB: D1Database
  SESSIONS: KVNamespace
  SESSION_DO: DurableObjectNamespace
  ANAM_API_KEY: string
  ANAM_API_URL: string
  DEEPGRAM_API_KEY: string
  GEMINI_AI_API_KEY: string
  ANAM_AVATAR_ID?: string
  ANAM_VOICE_ID?: string
}

export type User = {
  id: string
  email: string
  name: string
  role: string
}

export type ValidationResult = { success: boolean; data: any; error: any }
export type ValidationTarget = 'json' | 'form' | 'query' | 'param' | 'header' | 'cookie'
export type ValidationResults = {
  [K in `validationResult_${ValidationTarget}`]?: ValidationResult
}

export type HonoContext = {
  Variables: {
    user: User | null
  } & ValidationResults
  Bindings: Env
}

declare module 'hono' {
  interface ContextRenderer {
    (content: string | Promise<string>, props?: { title?: string }): Response
  }
  interface ContextVariableMap {
    user: User | null
  }
}
