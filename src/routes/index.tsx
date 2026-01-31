import type { Context } from 'hono'
import type { Env } from '@/types'

export const onRequestGet = (c: Context<{ Bindings: Env }>) => {
  const user = c.get('user')

  return c.render(
    <>
      {/* Navigation */}
      <nav class="nav">
        <div class="container row row-between">
          <a href="/" class="nav-logo">A<span>í</span>ngel</a>
          <div class="nav-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            {user ? (
              <a href="/onboarding" class="btn btn-primary btn-sm">Dashboard</a>
            ) : (
              <a href="/login" class="btn btn-primary btn-sm">Sign In</a>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section class="hero">
        <div class="container">
          <div class="hero-content">
            <div class="hero-tag">
              AI Companion for Elderly Care
            </div>
            <h1>
              A gentle voice,<br />
              <em>always there.</em>
            </h1>
            <p class="hero-subtitle">
              Aíngel is an AI-powered companion that provides personalised support, 
              monitors wellbeing, and brings comfort through natural conversation — 
              remembering what matters to every individual.
            </p>
            <div class="hero-actions">
              <a href={user ? '/onboarding' : '/register'} class="btn btn-primary btn-lg">
                Get Started
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </a>
              <a href="#how-it-works" class="btn btn-ghost btn-lg">Learn More</a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section class="section" style="padding-top: 0;">
        <div class="container">
          <div class="stats-bar">
            <div class="stat-item">
              <div class="stat-value">&lt;1s</div>
              <div class="stat-label">Response Time</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">∞</div>
              <div class="stat-label">Memory Persistence</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">0ms</div>
              <div class="stat-label">Cold Start</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">24/7</div>
              <div class="stat-label">Availability</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section class="section" id="features">
        <div class="container">
          <div class="section-header">
            <h2>Built for <em>real</em> care</h2>
            <p>
              Every feature designed around the needs of elderly patients, their carers, 
              and the healthcare teams who support them.
            </p>
          </div>

          <div class="features-grid">
            <div class="card fade-in delay-1">
              <div class="card-icon amber">🗣️</div>
              <h3>Natural Conversation</h3>
              <p class="text-secondary" style="margin-top: 0.75rem; line-height: 1.6;">
                Voice-first interaction powered by real-time AI. Aíngel listens, understands, 
                and responds naturally — no screens or typing needed.
              </p>
            </div>

            <div class="card fade-in delay-2">
              <div class="card-icon sage">💾</div>
              <h3>Persistent Memory</h3>
              <p class="text-secondary" style="margin-top: 0.75rem; line-height: 1.6;">
                Remembers preferences, triggers, and personal history across every session. 
                Your companion genuinely knows you.
              </p>
            </div>

            <div class="card fade-in delay-3">
              <div class="card-icon rose">🛡️</div>
              <h3>Safety First</h3>
              <p class="text-secondary" style="margin-top: 0.75rem; line-height: 1.6;">
                Real-time detection of distress or health concerns with immediate escalation 
                to care teams via NHS integration.
              </p>
            </div>

            <div class="card fade-in delay-1">
              <div class="card-icon amber">👤</div>
              <h3>Lifelike Avatar</h3>
              <p class="text-secondary" style="margin-top: 0.75rem; line-height: 1.6;">
                A warm, expressive digital companion powered by Anam AI. Natural lip-sync, 
                gestures, and emotional expression.
              </p>
            </div>

            <div class="card fade-in delay-2">
              <div class="card-icon sage">⚡</div>
              <h3>Edge-Powered</h3>
              <p class="text-secondary" style="margin-top: 0.75rem; line-height: 1.6;">
                Built on Cloudflare's global edge network. Zero cold starts, sub-second 
                responses, infinite scale. Always available.
              </p>
            </div>

            <div class="card fade-in delay-3">
              <div class="card-icon rose">📋</div>
              <h3>Guided Onboarding</h3>
              <p class="text-secondary" style="margin-top: 0.75rem; line-height: 1.6;">
                Voice-guided registration and setup. Aíngel fills in forms as you speak — 
                no typing, no confusion, just conversation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section class="section" id="how-it-works">
        <div class="container">
          <div class="section-header">
            <h2>How it <em>works</em></h2>
            <p>
              From first meeting to daily companion — the journey is guided, 
              personal, and entirely voice-driven.
            </p>
          </div>

          <div class="features-grid" style="grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));">
            <div class="card" style="border-left: 2px solid var(--amber);">
              <div class="text-amber text-xs mono" style="margin-bottom: 0.75rem;">01</div>
              <h3>Onboarding</h3>
              <p class="text-secondary" style="margin-top: 0.5rem; line-height: 1.6; font-size: 0.9rem;">
                Aíngel guides the patient through registration via natural conversation. 
                Speaks, listens, and fills in the details.
              </p>
            </div>

            <div class="card" style="border-left: 2px solid var(--sage);">
              <div class="text-sage text-xs mono" style="margin-bottom: 0.75rem;">02</div>
              <h3>Getting to Know You</h3>
              <p class="text-secondary" style="margin-top: 0.5rem; line-height: 1.6; font-size: 0.9rem;">
                Preferences, routines, health context, and personal stories are 
                remembered and built into a growing profile.
              </p>
            </div>

            <div class="card" style="border-left: 2px solid var(--rose);">
              <div class="text-rose text-xs mono" style="margin-bottom: 0.75rem;">03</div>
              <h3>Daily Companion</h3>
              <p class="text-secondary" style="margin-top: 0.5rem; line-height: 1.6; font-size: 0.9rem;">
                Chat anytime. Aíngel provides companionship, monitors wellbeing, 
                and knows when to alert the care team.
              </p>
            </div>

            <div class="card" style="border-left: 2px solid var(--amber);">
              <div class="text-amber text-xs mono" style="margin-bottom: 0.75rem;">04</div>
              <h3>Continuous Care</h3>
              <p class="text-secondary" style="margin-top: 0.5rem; line-height: 1.6; font-size: 0.9rem;">
                Cross-session memory, wearable integration, and NHS API connections 
                create a continuous care loop.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer class="footer">
        <div class="container">
          <p style="margin-bottom: 0.5rem;">
            <span class="nav-logo" style="font-size: 1.1rem;">A<span>í</span>ngel</span>
          </p>
          <p>Built with care by Fluxwise AI · Powered by Cloudflare</p>
        </div>
      </footer>
    </>,
    { title: 'Aíngel — AI Companion for Elderly Care' }
  )
}
