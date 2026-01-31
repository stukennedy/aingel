import { z } from 'zod'
import type { Env } from '@/types'
import { factory, softValidator, getValidation } from '@/utils/soft-validator'

const formFieldSchema = z.object({
  field: z.string().min(1, 'Missing field name'),
  fullName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  age: z.string().optional(),
  physical: z.string().optional(),
  mental: z.string().optional(),
})

export const onRequestPost = factory.createHandlers(
  softValidator('form', formFieldSchema),
  async (c) => {
    const user = c.get('user')
    if (!user) {
      return c.html('Not authenticated')
    }

    const validation = getValidation<z.infer<typeof formFieldSchema>>(c, 'form')

    if (!validation.success) {
      const msg = validation.error?.issues[0]?.message || 'Validation failed'
      return c.html(msg)
    }

    const { field } = validation.data
    const value = (validation.data[field as keyof typeof validation.data] ?? '') as string

    const id = c.env.SESSION_DO.idFromName(user.id)
    const stub = c.env.SESSION_DO.get(id)
    const res = await stub.fetch(new Request('http://do/field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    }))
    const result = await res.json() as { ok: boolean; error?: string }

    if (!result.ok) {
      return c.html(result.error ?? 'Update failed')
    }

    return c.html(`<span id="save-${field}" class="save-indicator visible">✓ saved</span>`)
  },
)
