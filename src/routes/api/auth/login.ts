import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { users } from '@/db/schema'
import { hashPassword, createSession } from '@/lib/auth'
import { factory, softValidator, getValidation } from '@/utils/soft-validator'

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const onRequestPost = factory.createHandlers(
  softValidator('form', loginSchema),
  async (c) => {
    const validation = getValidation<z.infer<typeof loginSchema>>(c, 'form')

    if (!validation.success) {
      const msg = validation.error?.issues[0]?.message || 'Validation failed'
      return c.html(msg)
    }

    const { email, password } = validation.data
    const db = drizzle(c.env.DB)
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)

    if (!user) {
      return c.html('Invalid email or password.')
    }

    const hash = await hashPassword(password)
    if (hash !== user.passwordHash) {
      return c.html('Invalid email or password.')
    }

    await createSession(c, {
      id: user.id,
      email: user.email,
      name: user.name ?? '',
      role: user.role ?? 'user',
    })

    c.header('HX-Redirect', '/onboarding')
    return c.body(null)
  },
)
