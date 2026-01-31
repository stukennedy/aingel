import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { users } from '@/db/schema'
import { hashPassword, createSession, generateId } from '@/lib/auth'
import { factory, softValidator, getValidation } from '@/utils/soft-validator'

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const onRequestPost = factory.createHandlers(
  softValidator('form', registerSchema),
  async (c) => {
    const validation = getValidation<z.infer<typeof registerSchema>>(c, 'form')

    if (!validation.success) {
      const msg = validation.error?.issues[0]?.message || 'Validation failed'
      return c.html(msg)
    }

    const { name, email, password } = validation.data
    const db = drizzle(c.env.DB)

    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (existing) {
      return c.html('An account with this email already exists.')
    }

    const id = generateId()
    const passwordHash = await hashPassword(password)

    await db.insert(users).values({
      id,
      email,
      name,
      passwordHash,
      role: 'user',
    })

    await createSession(c, { id, email, name, role: 'user' })

    c.header('HX-Redirect', '/onboarding')
    return c.body(null)
  },
)
