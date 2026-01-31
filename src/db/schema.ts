import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  role: text('role').default('user'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const patients = sqliteTable('patients', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  fullName: text('full_name'),
  email: text('email'),
  phone: text('phone'),
  age: integer('age'),
  physicalStatus: text('physical_status'),
  mentalStatus: text('mental_status'),
  preferences: text('preferences'), // JSON
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').references(() => patients.id),
  startedAt: integer('started_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  mode: text('mode'), // 'onboarding' | 'companion'
  summary: text('summary'),
  transcript: text('transcript'), // JSON array
})

export const memory = sqliteTable('memory', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').references(() => patients.id),
  kind: text('kind'), // 'preference' | 'trigger' | 'health' | 'note'
  content: text('content'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
})
