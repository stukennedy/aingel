# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Aíngel

AI companion for elderly care. Voice-driven onboarding collects patient profiles via a real-time pipeline: browser mic → Deepgram ASR → Gemini Flash LLM (with tool-calling to fill form fields) → Anam avatar TTS. Runs entirely on Cloudflare Workers edge infrastructure.

## Commands

- `bun run dev` — Local dev server (wrangler dev)
- `bun run deploy` — Deploy to Cloudflare Workers
- `bun run routes` — Regenerate file-based routing (hono-router, watch mode)
- `bun run db:generate` — Generate Drizzle migrations
- `bun run db:migrate` — Apply D1 migrations locally
- `bun run typecheck` — Type-check only (tsc --noEmit)

Secrets go in `.dev.vars` (DEEPGRAM_API_KEY, GEMINI_AI_API_KEY, ANAM_API_KEY, etc.).

## Architecture

**Runtime:** Cloudflare Workers with D1 (SQLite), KV (sessions), Durable Objects (stateful voice sessions).

**Stack:** Hono v4 (server framework + JSX), Datastar (SSE-driven hypermedia reactivity on frontend), Drizzle ORM, Zod validation.

**File-based routing** via `hono-router`: routes in `src/routes/` map directly to URL paths. `src/router.ts` loads them. Layout wrapper in `src/routes/Layout.tsx`.

**Key layers:**
- `src/routes/` — Pages (JSX) and API handlers
- `src/routes/api/` — REST endpoints (auth, session, anam-token)
- `src/do/session.ts` — `SessionDO` Durable Object: holds form state, orchestrates voice pipeline over WebSocket
- `src/do/services/transcription.ts` — `TranscriptionService`: Deepgram WebSocket streaming ASR
- `src/do/services/llm.ts` — `LLMService`: Gemini Flash with tool-calling, maintains 16-turn conversation history
- `src/db/schema.ts` — Drizzle schema (users, patients, conversations, memory tables)
- `src/lib/auth.ts` — Cookie+KV session auth with middleware
- `public/js/` — Client-side voice orchestration (anam-session.js, audio-capture.js)

**Voice pipeline flow:** Client WebSocket → SessionDO → TranscriptionService (Deepgram) → final transcript → LLMService (Gemini) → tool calls update form fields → text deltas streamed back to client → Anam avatar renders speech.

**Frontend pattern:** Server-rendered Hono JSX + Datastar attributes (`data-signals`, `data-on-click`, `data-text`) for reactivity. SSE responses from API endpoints drive UI updates. No JS framework.

## Env bindings (wrangler.toml)

- `DB` — D1 database
- `SESSIONS` — KV namespace
- `SESSION_DO` — Durable Object namespace (class: SessionDO)

## TypeScript

JSX uses `hono/jsx` (jsxImportSource). Path alias `@/*` maps to `./src/*`. Strict mode enabled.
