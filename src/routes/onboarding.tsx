import type { Context } from 'hono'
import type { Env } from '../types'

export const onRequestGet = (c: Context<{ Bindings: Env }>) => {
  const user = c.get('user')
  if (!user) return c.redirect('/login')

  return c.render(
    <>
      <nav class="nav">
        <div class="container row row-between">
          <a href="/" class="nav-logo">A<span>í</span>ngel</a>
          <div class="nav-links">
            <span class="text-secondary text-sm">{user.name}</span>
            <button
              class="btn btn-ghost btn-sm"
              data-on-click="@post('/api/auth/logout')"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding-top: 5rem;">
        <div class="container" style="max-width: 800px; text-align: center;">
          <div style="margin-bottom: 2rem;">
            <div style="width: 120px; height: 120px; border-radius: 50%; background: var(--amber-soft); border: 2px solid var(--amber-glow); margin: 0 auto 2rem; display: flex; align-items: center; justify-content: center; font-size: 3rem; animation: breathe 4s ease-in-out infinite;">
              👤
            </div>
            <h1 style="font-size: 2.5rem; margin-bottom: 1rem;">
              Hello, <em>{user.name?.split(' ')[0] ?? 'there'}</em>
            </h1>
            <p class="text-secondary" style="font-size: 1.1rem; max-width: 480px; margin: 0 auto; line-height: 1.7;">
              I'm Aíngel, your companion. Let's get to know each other.
              When you're ready, we'll start a conversation and I'll help you 
              get set up — just by talking.
            </p>
          </div>

          <div style="margin-top: 3rem;">
            <button class="btn btn-primary btn-lg" disabled style="opacity: 0.5; cursor: not-allowed;">
              🎙️ Start Voice Session
              <span class="text-xs" style="margin-left: 0.5rem; opacity: 0.7;">(Coming soon)</span>
            </button>
            <p class="text-muted text-sm" style="margin-top: 1rem;">
              Voice pipeline powered by Cloudflare Durable Objects · Deepgram ASR · Gemini Flash
            </p>
          </div>

          {/* Onboarding form preview - will be populated by voice */}
          <div style="margin-top: 4rem; text-align: left;">
            <h3 style="margin-bottom: 1.5rem; color: var(--text-secondary);">Your Profile</h3>
            <div id="onboarding-form" class="card" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;">
              <div class="form-group">
                <label class="form-label">Full Name</label>
                <input class="form-input" type="text" id="field-fullName" placeholder="Filled by voice..." readonly />
              </div>
              <div class="form-group">
                <label class="form-label">Email</label>
                <input class="form-input" type="email" id="field-email" value={user.email} readonly />
              </div>
              <div class="form-group">
                <label class="form-label">Phone</label>
                <input class="form-input" type="tel" id="field-phone" placeholder="Filled by voice..." readonly />
              </div>
              <div class="form-group">
                <label class="form-label">Age</label>
                <input class="form-input" type="text" id="field-age" placeholder="Filled by voice..." readonly />
              </div>
              <div class="form-group">
                <label class="form-label">Physical Health</label>
                <input class="form-input" type="text" id="field-physical" placeholder="Filled by voice..." readonly />
              </div>
              <div class="form-group">
                <label class="form-label">Emotional Wellbeing</label>
                <input class="form-input" type="text" id="field-mental" placeholder="Filled by voice..." readonly />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>,
    { title: 'Onboarding — Aíngel' }
  )
}
