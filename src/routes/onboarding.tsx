import type { Context } from 'hono'
import { html } from 'hono/html'
import { Script } from 'vite-ssr-components/hono'
import type { Env } from '@/types'

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
              hx-post="/api/auth/logout"
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
              Fill in your profile below, and we'll be on our way.
            </p>
          </div>

          {/* Error display */}
          <div id="form-error" class="form-error-banner"></div>

          {/* Onboarding form */}
          <div style="margin-top: 3rem; text-align: left;">
            <h3 style="margin-bottom: 1.5rem; color: var(--text-secondary);">Your Profile</h3>
            <div id="onboarding-form" class="card" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;">

              <div class="form-group">
                <label class="form-label">Full Name <span class="required">*</span></label>
                <input
                  class="form-input"
                  type="text"
                  name="fullName"
                  placeholder="Your full name"
                  hx-post="/api/session/form"
                  hx-trigger="change"
                  hx-target="#save-fullName"
                  hx-swap="outerHTML"
                  hx-vals='{"field": "fullName"}'
                />
                <span id="save-fullName" class="save-indicator"></span>
              </div>

              <div class="form-group">
                <label class="form-label">Email</label>
                <input
                  class="form-input"
                  type="email"
                  name="email"
                  value={user.email}
                  hx-post="/api/session/form"
                  hx-trigger="change"
                  hx-target="#save-email"
                  hx-swap="outerHTML"
                  hx-vals='{"field": "email"}'
                />
                <span id="save-email" class="save-indicator"></span>
              </div>

              <div class="form-group">
                <label class="form-label">Phone</label>
                <input
                  class="form-input"
                  type="tel"
                  name="phone"
                  placeholder="Your phone number"
                  hx-post="/api/session/form"
                  hx-trigger="change"
                  hx-target="#save-phone"
                  hx-swap="outerHTML"
                  hx-vals='{"field": "phone"}'
                />
                <span id="save-phone" class="save-indicator"></span>
              </div>

              <div class="form-group">
                <label class="form-label">Age</label>
                <input
                  class="form-input"
                  type="number"
                  name="age"
                  placeholder="Your age"
                  hx-post="/api/session/form"
                  hx-trigger="change"
                  hx-target="#save-age"
                  hx-swap="outerHTML"
                  hx-vals='{"field": "age"}'
                />
                <span id="save-age" class="save-indicator"></span>
              </div>

              <div class="form-group">
                <label class="form-label">Physical Health</label>
                <input
                  class="form-input"
                  type="text"
                  name="physical"
                  placeholder="Any conditions or notes..."
                  hx-post="/api/session/form"
                  hx-trigger="change"
                  hx-target="#save-physical"
                  hx-swap="outerHTML"
                  hx-vals='{"field": "physical"}'
                />
                <span id="save-physical" class="save-indicator"></span>
              </div>

              <div class="form-group">
                <label class="form-label">Emotional Wellbeing</label>
                <input
                  class="form-input"
                  type="text"
                  name="mental"
                  placeholder="How are you feeling?"
                  hx-post="/api/session/form"
                  hx-trigger="change"
                  hx-target="#save-mental"
                  hx-swap="outerHTML"
                  hx-vals='{"field": "mental"}'
                />
                <span id="save-mental" class="save-indicator"></span>
              </div>

            </div>

            {/* Submit area */}
            <div style="margin-top: 2rem; text-align: center;">
              <div id="submit-status"></div>
              <button
                class="btn btn-primary btn-lg"
                hx-post="/api/session/submit"
                hx-target="#submit-status"
                hx-swap="innerHTML"
              >
                ✨ Save Profile
              </button>
            </div>
          </div>

          {/* Voice session area */}
          <div style="margin-top: 2rem;">
            <video id="anam-video" style="display: none; width: 320px; height: 320px; border-radius: 1rem; margin: 0 auto 1rem; object-fit: cover;" autoplay playsinline></video>

            <div style="display: flex; gap: 0.75rem; justify-content: center;">
              <button id="voice-start-btn" class="btn btn-primary btn-lg">
                🎙️ Start Voice Session
              </button>
              <button id="voice-stop-btn" class="btn btn-ghost btn-lg" style="display: none;">
                ⏹ Stop
              </button>
            </div>

            <p id="voice-status" class="text-muted text-sm" style="margin-top: 0.75rem;">
              Voice pipeline powered by Cloudflare Durable Objects · Deepgram ASR · Gemini Flash
            </p>

            <div id="voice-transcript" style="display: none; margin-top: 1rem; max-height: 200px; overflow-y: auto; text-align: left; background: rgba(0,0,0,0.05); border-radius: 0.5rem; padding: 0.75rem; font-size: 0.9rem; line-height: 1.6;"></div>
          </div>

          <Script type="module" src="/src/client/onboarding.ts" />
        </div>
      </div>

      {html`<style>
        .save-indicator {
          display: inline-block;
          font-size: 0.75rem;
          color: var(--sage, #6b8f71);
          opacity: 0;
          transition: opacity 0.3s ease;
          margin-left: 0.5rem;
        }
        .save-indicator.visible {
          opacity: 1;
        }
        .form-error-banner {
          background: var(--rose-soft, rgba(220,80,80,0.1));
          color: var(--rose, #c75050);
          padding: 0.75rem 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
        }
        .form-error-banner:empty {
          display: none;
        }
        .required {
          color: var(--rose, #c75050);
        }
        .submit-success {
          background: var(--sage-soft, rgba(107,143,113,0.1));
          color: var(--sage, #6b8f71);
          padding: 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          font-weight: 500;
        }
        .form-group {
          position: relative;
        }
      </style>`}
    </>,
    { title: 'Onboarding — Aíngel' }
  )
}
