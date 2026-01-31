import type { Context } from 'hono'
import type { Env } from '../types'

export const onRequestGet = (c: Context<{ Bindings: Env }>) => {
  const user = c.get('user')
  if (user) return c.redirect('/onboarding')

  return c.render(
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-header">
          <a href="/" class="nav-logo">A<span>í</span>ngel</a>
          <p>Welcome back. Sign in to continue.</p>
        </div>

        <form
          class="auth-form"
          data-signals='{"email": "", "password": "", "error": ""}'
          data-on-submit__prevent="@post('/api/auth/login')"
        >
          <div class="form-group">
            <label class="form-label" for="email">Email</label>
            <input
              class="form-input"
              type="email"
              id="email"
              name="email"
              data-bind="email"
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
              data-bind="password"
              placeholder="••••••••"
              required
              autocomplete="current-password"
            />
          </div>

          <div id="auth-error" class="form-error" data-text="$error"></div>

          <button type="submit" class="btn btn-primary btn-lg" style="width: 100%;">
            Sign In
          </button>
        </form>

        <div class="auth-footer">
          Don't have an account? <a href="/register">Create one</a>
        </div>
      </div>
    </div>,
    { title: 'Sign In — Aíngel' }
  )
}
