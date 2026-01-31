import type { Context } from 'hono'
import type { Env } from '@/types'

export const onRequestGet = (c: Context<{ Bindings: Env }>) => {
  const user = c.get('user')
  if (user) return c.redirect('/onboarding')

  return c.render(
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-header">
          <a href="/" class="nav-logo">A<span>í</span>ngel</a>
          <p>Create your account to get started.</p>
        </div>

        <form
          class="auth-form"
          hx-post="/api/auth/register"
          hx-target="#auth-error"
          hx-swap="innerHTML"
        >
          <div class="form-group">
            <label class="form-label" for="name">Full Name</label>
            <input
              class="form-input"
              type="text"
              id="name"
              name="name"
              placeholder="Your name"
              required
              autocomplete="name"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="email">Email</label>
            <input
              class="form-input"
              type="email"
              id="email"
              name="email"
              placeholder="you@example.com"
              required
              autocomplete="email"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="password">Password</label>
            <input
              class="form-input"
              type="password"
              id="password"
              name="password"
              placeholder="••••••••"
              required
              minlength={8}
              autocomplete="new-password"
            />
          </div>

          <div id="auth-error" class="form-error"></div>

          <button type="submit" class="btn btn-primary btn-lg" style="width: 100%;">
            Create Account
          </button>
        </form>

        <div class="auth-footer">
          Already have an account? <a href="/login">Sign in</a>
        </div>
      </div>
    </div>,
    { title: 'Register — Aíngel' }
  )
}
