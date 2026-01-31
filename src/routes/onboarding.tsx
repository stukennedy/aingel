import type { Context } from "hono";
import { html } from "hono/html";
import { Script } from "vite-ssr-components/hono";
import type { Env } from "@/types";

export const onRequestGet = async (c: Context<{ Bindings: Env }>) => {
  const user = c.get("user");
  if (!user) return c.redirect("/login");

  // Load form state from the DO (single source of truth)
  const id = c.env.SESSION_DO.idFromName(user.id);
  const stub = c.env.SESSION_DO.get(id);
  const res = await stub.fetch(new Request("http://do/state"));
  const { form } = (await res.json()) as { ok: boolean; form: Record<string, string> };

  const p = {
    fullName: form?.fullName || user.name || "",
    email: form?.email || user.email || "",
    phone: form?.phone || "",
    age: form?.age || "",
    physical: form?.physical || "",
    mental: form?.mental || "",
  };

  return c.render(
    <>
      <nav class="nav">
        <div class="container row row-between">
          <a href="/" class="nav-logo">
            A<span>í</span>ngel
          </a>
          <div class="nav-links">
            <span class="text-secondary text-sm">{user.name}</span>
            <button class="btn btn-ghost btn-sm" hx-post="/api/auth/logout">
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* Main onboarding layout — connected via hx-ws */}
      <div class="onboard-layout" hx-ext="ws" hx-ws:connect="/api/session/ws">
        {/* ── Left: Avatar Stage ── */}
        <div class="avatar-stage">
          <div class="avatar-frame">
            <video
              id="anam-video"
              class="avatar-video"
              autoplay
              playsinline
              style="display: none;"
            ></video>
            <div id="avatar-placeholder" class="avatar-placeholder">
              <div class="avatar-ring">
                <div class="avatar-icon">👤</div>
              </div>
              <p class="avatar-cta">Start a voice session to begin</p>
            </div>
          </div>

          {/* Voice controls */}
          <div class="voice-controls">
            <button
              id="voice-start-btn"
              class="btn btn-primary btn-lg voice-btn"
            >
              <span class="mic-icon">◉</span> Start Voice Session
            </button>
            <button
              id="voice-stop-btn"
              class="btn btn-ghost btn-lg voice-btn"
              style="display: none;"
            >
              ◼ End Session
            </button>
          </div>

          {/* Status + interim transcript */}
          <div class="voice-meta">
            <div id="voice-status" class="voice-status">
              <span class="status-idle">Ready</span>
            </div>
            <div id="voice-interim" class="voice-interim"></div>
          </div>

          {/* Conversation transcript */}
          <div id="voice-transcript" class="voice-transcript"></div>
        </div>

        {/* ── Right: Form Panel ── */}
        <aside class="form-panel">
          <div class="form-panel-header">
            <h3>Patient Profile</h3>
            <p class="text-secondary text-sm">
              Fields fill automatically as you speak
            </p>
          </div>

          <div id="onboarding-form" class="onboard-fields">
            <div class="form-group">
              <label class="form-label">
                Full Name <span class="required">*</span>
              </label>
              <input
                class="form-input field-input"
                type="text"
                name="fullName"
                id="field-fullName"
                value={p.fullName}
                placeholder="Patient's full name"
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
                class="form-input field-input"
                type="email"
                name="email"
                id="field-email"
                value={p.email}
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
                class="form-input field-input"
                type="tel"
                name="phone"
                id="field-phone"
                value={p.phone}
                placeholder="Phone number"
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
                class="form-input field-input"
                type="text"
                name="age"
                id="field-age"
                value={p.age}
                placeholder="Age"
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
                class="form-input field-input"
                type="text"
                name="physical"
                id="field-physical"
                value={p.physical}
                placeholder="Conditions or notes"
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
                class="form-input field-input"
                type="text"
                name="mental"
                id="field-mental"
                value={p.mental}
                placeholder="How are they feeling?"
                hx-post="/api/session/form"
                hx-trigger="change"
                hx-target="#save-mental"
                hx-swap="outerHTML"
                hx-vals='{"field": "mental"}'
              />
              <span id="save-mental" class="save-indicator"></span>
            </div>
          </div>

          <div class="form-panel-footer">
            <div id="submit-status"></div>
            <button
              class="btn btn-primary"
              style="width: 100%;"
              hx-post="/api/session/submit"
              hx-target="#submit-status"
              hx-swap="innerHTML"
            >
              Save Profile
            </button>
          </div>
        </aside>
      </div>

      <Script type="module" src="/src/client/onboarding.ts" />

      {html`<style>
        /* ── Onboarding Layout ── */
        .onboard-layout {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 0;
          min-height: 100vh;
          padding-top: 4.5rem;
        }

        /* ── Avatar Stage (Left) ── */
        .avatar-stage {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem 2rem 3rem;
          position: relative;
        }

        .avatar-stage::before {
          content: "";
          position: absolute;
          top: 20%;
          left: 50%;
          transform: translateX(-50%);
          width: 500px;
          height: 500px;
          background: radial-gradient(
            ellipse,
            var(--amber-soft) 0%,
            transparent 70%
          );
          pointer-events: none;
          animation: breathe 8s ease-in-out infinite;
        }

        .avatar-frame {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 480px;
          aspect-ratio: 1;
          border-radius: 1.5rem;
          overflow: hidden;
          background: var(--ink-deep);
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .avatar-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 1.5rem;
        }

        .avatar-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
        }

        .avatar-ring {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: var(--amber-soft);
          border: 2px solid var(--amber-glow);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: breathe 4s ease-in-out infinite;
        }

        .avatar-icon {
          font-size: 3rem;
          line-height: 1;
        }

        .avatar-cta {
          color: var(--text-muted);
          font-size: 0.9rem;
        }

        /* ── Voice Controls ── */
        .voice-controls {
          position: relative;
          z-index: 1;
          margin-top: 1.5rem;
          display: flex;
          gap: 0.75rem;
        }

        .voice-btn {
          gap: 0.6rem;
        }

        .mic-icon {
          display: inline-block;
          color: var(--ink-deep);
          animation: pulse-dot 2s ease-in-out infinite;
        }

        .voice-meta {
          position: relative;
          z-index: 1;
          margin-top: 1rem;
          text-align: center;
          min-height: 2rem;
        }

        .voice-status {
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .status-idle {
          color: var(--text-muted);
        }
        .status-live {
          color: var(--sage);
        }
        .status-complete {
          color: var(--amber);
        }

        .voice-interim {
          font-size: 0.85rem;
          color: var(--text-secondary);
          font-style: italic;
          margin-top: 0.25rem;
          min-height: 1.2em;
        }

        /* ── Transcript ── */
        .voice-transcript {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 480px;
          max-height: 200px;
          overflow-y: auto;
          margin-top: 1rem;
          font-size: 0.85rem;
          line-height: 1.6;
        }

        .transcript-line {
          padding: 0.35rem 0.75rem;
          border-radius: 0.5rem;
          margin-bottom: 0.35rem;
        }

        .transcript-user {
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-secondary);
        }

        .transcript-agent {
          background: var(--amber-soft);
          color: var(--text);
        }

        .transcript-role {
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-right: 0.5rem;
          opacity: 0.6;
        }

        .transcript-user .transcript-role {
          color: var(--text-muted);
        }
        .transcript-agent .transcript-role {
          color: var(--amber);
        }

        /* ── Form Panel (Right) ── */
        .form-panel {
          background: var(--ink-deep);
          border-left: 1px solid var(--border);
          padding: 2rem 1.5rem;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }

        .form-panel-header {
          margin-bottom: 1.5rem;
        }

        .form-panel-header h3 {
          margin-bottom: 0.25rem;
        }

        .onboard-fields {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          flex: 1;
        }

        .field-input {
          transition: all 0.3s ease;
        }

        .field-input:not([value=""]):not(:placeholder-shown) {
          border-color: var(--sage);
          background: rgba(125, 184, 138, 0.05);
        }

        .form-panel-footer {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border);
        }

        .save-indicator {
          display: inline-block;
          font-size: 0.7rem;
          color: var(--sage);
          opacity: 0;
          transition: opacity 0.3s ease;
          margin-left: 0.5rem;
        }

        .save-indicator.visible {
          opacity: 1;
        }

        .form-error-banner {
          background: var(--rose-soft);
          color: var(--rose);
          padding: 0.75rem 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
        }

        .form-error-banner:empty {
          display: none;
        }

        .required {
          color: var(--rose);
        }

        .submit-success {
          background: var(--sage-soft);
          color: var(--sage);
          padding: 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          font-weight: 500;
        }

        .form-group {
          position: relative;
        }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          .onboard-layout {
            grid-template-columns: 1fr;
            grid-template-rows: auto auto;
          }

          .avatar-stage {
            padding: 1.5rem;
          }

          .avatar-frame {
            max-width: 320px;
          }

          .form-panel {
            border-left: none;
            border-top: 1px solid var(--border);
          }
        }
      </style>`}
    </>,
    { title: "Onboarding — Aíngel" },
  );
};
