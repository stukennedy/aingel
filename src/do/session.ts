// SessionDO — Durable Object for per-user onboarding form state + voice pipeline
// Keyed by user ID. Manages form fields, voice ASR/LLM pipeline, broadcasts to WebSocket clients.
// Sends HTMX 4 hx-ws JSON envelope messages for DOM updates + custom channel for voice data.

import { TranscriptionService } from './services/transcription';
import { LLMService } from './services/llm';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { patients } from '@/db/schema';
import { generateId } from '@/lib/auth';

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  age: string;
  physical: string;
  mental: string;
}

const EMPTY_FORM: FormState = {
  fullName: '',
  email: '',
  phone: '',
  age: '',
  physical: '',
  mental: '',
};

const FIELD_LABELS: Record<keyof FormState, string> = {
  fullName: 'Full Name',
  email: 'Email',
  phone: 'Phone',
  age: 'Age',
  physical: 'Physical Health',
  mental: 'Emotional Wellbeing',
};

const VALID_FIELDS = new Set<keyof FormState>(Object.keys(EMPTY_FORM) as (keyof FormState)[]);

export class SessionDO implements DurableObject {
  state: DurableObjectState;
  env: any;
  formState: FormState | null = null;
  private userId: string | null = null;

  // Voice pipeline services
  private transcription: TranscriptionService | null = null;
  private llm: LLMService | null = null;
  private voiceMode = false;

  // Turn-taking: agent speaks uninterrupted, user speech is buffered
  private agentSpeaking = false;
  private bufferedTranscripts: string[] = [];
  private ttsDrainTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly TTS_DRAIN_MS = 500; // grace period after LLM finishes for TTS to play out

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  private async loadState(): Promise<FormState> {
    if (this.formState) return this.formState;
    const stored = await this.state.storage.get<FormState>('form');
    this.formState = stored ?? { ...EMPTY_FORM };
    return this.formState;
  }

  private async saveState(): Promise<void> {
    if (this.formState) {
      await this.state.storage.put('form', this.formState);
    }
  }

  private async saveToD1(): Promise<void> {
    if (!this.formState || !this.userId || !this.env.DB) return;
    const form = this.formState;
    const db = drizzle(this.env.DB);
    try {
      const existing = await db.select().from(patients).where(eq(patients.userId, this.userId)).limit(1);
      const data = {
        fullName: form.fullName || null,
        email: form.email || null,
        phone: form.phone || null,
        age: form.age ? parseInt(form.age, 10) : null,
        physicalStatus: form.physical || null,
        mentalStatus: form.mental || null,
      };
      if (existing.length > 0) {
        await db.update(patients).set(data).where(eq(patients.userId, this.userId));
      } else {
        await db.insert(patients).values({ id: generateId(), userId: this.userId, ...data });
      }
      console.log('[SessionDO] Saved to D1');
    } catch (e: any) {
      console.error('[SessionDO] D1 save error:', e?.message || e);
    }
  }

  // Send HTMX 4 hx-ws envelope for DOM updates (channel: "ui")
  private broadcastUI(target: string, html: string, swap = 'innerHTML'): void {
    const msg = JSON.stringify({ channel: 'ui', target, swap, payload: html });
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(msg); } catch {}
    }
  }

  // Send voice channel data (channel: "voice") — picked up by client JS for Anam TTS
  private broadcastVoice(data: Record<string, unknown>): void {
    const msg = JSON.stringify({ channel: 'voice', payload: data });
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(msg); } catch {}
    }
  }

  // Send to a specific WebSocket
  private sendTo(ws: WebSocket, message: object): void {
    try { ws.send(JSON.stringify(message)); } catch {}
  }

  // Escape HTML entities
  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Capture userId if provided
    const uid = url.searchParams.get('userId');
    if (uid) this.userId = uid;

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    // GET /state
    if (request.method === 'GET' && url.pathname === '/state') {
      const form = await this.loadState();
      return Response.json({ ok: true, form });
    }

    // POST /field
    if (request.method === 'POST' && url.pathname === '/field') {
      const { field, value } = await request.json() as { field: string; value: string };
      if (!VALID_FIELDS.has(field as keyof FormState)) {
        return Response.json({ ok: false, error: 'Invalid field' }, { status: 400 });
      }
      const form = await this.loadState();
      (form as any)[field] = value;
      await this.saveState();
      this.broadcastFieldUpdate(field as keyof FormState, value);
      this.saveToD1().catch(() => {});
      return Response.json({ ok: true, field, value });
    }

    // POST /submit
    if (request.method === 'POST' && url.pathname === '/submit') {
      const form = await this.loadState();
      if (!form.fullName) {
        return Response.json({ ok: false, error: 'Full name is required' }, { status: 400 });
      }
      return Response.json({ ok: true, form });
    }

    // POST /reset
    if (request.method === 'POST' && url.pathname === '/reset') {
      this.formState = { ...EMPTY_FORM };
      await this.saveState();
      // Reset all form fields in UI
      for (const field of VALID_FIELDS) {
        this.broadcastFieldUpdate(field, '');
      }
      return Response.json({ ok: true });
    }

    return Response.json({ status: 'ok', path: url.pathname });
  }

  // Broadcast a field update as both UI partial and voice channel data
  private broadcastFieldUpdate(field: keyof FormState, value: string): void {
    // Update the input value via hx-partial
    this.broadcastUI(
      `#field-${field}`,
      `<input class="form-input field-input" type="text" name="${field}" id="field-${field}" value="${this.esc(value)}" hx-post="/api/session/form" hx-trigger="change" hx-target="#save-${field}" hx-swap="outerHTML" hx-vals='{"field": "${field}"}' />`,
      'outerHTML',
    );
    // Show save indicator
    this.broadcastUI(
      `#save-${field}`,
      `<span id="save-${field}" class="save-indicator visible">✓</span>`,
      'outerHTML',
    );
    // Voice channel for any client-side logic
    this.broadcastVoice({ type: 'field_updated', field, value });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Binary data = audio chunks for Deepgram
    if (message instanceof ArrayBuffer) {
      if (this.voiceMode && this.transcription) {
        this.transcription.sendAudio(message);
      }
      return;
    }

    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'hello':
          if (data.mode === 'anam') {
            // Seed form with pre-filled values from signup
            if (data.prefill) {
              const form = await this.loadState();
              for (const [k, v] of Object.entries(data.prefill)) {
                if (v && VALID_FIELDS.has(k as keyof FormState) && !(form as any)[k]) {
                  (form as any)[k] = v;
                }
              }
              await this.saveState();
            }
            await this.initVoicePipeline(ws);
          }
          break;

        case 'get_state': {
          const form = await this.loadState();
          this.sendTo(ws, { type: 'form_state', form });
          break;
        }

        case 'update_field':
          if (data.field && VALID_FIELDS.has(data.field)) {
            const form = await this.loadState();
            (form as any)[data.field] = data.value ?? '';
            await this.saveState();
            this.broadcastFieldUpdate(data.field as keyof FormState, data.value ?? '');
            this.saveToD1().catch(() => {});
          }
          break;

        case 'stop_voice':
          this.stopVoicePipeline();
          break;

        default:
          // Ignore unknown types (e.g. HTMX ws extension internal messages)
          break;
      }
    } catch {
      // Non-JSON messages from HTMX ws extension — ignore
    }
  }

  async webSocketClose(): Promise<void> {
    const sockets = this.state.getWebSockets();
    if ([...sockets].length === 0) {
      this.stopVoicePipeline();
    }
  }

  // --- Turn-taking ---

  private async dispatchToLLM(text: string, turnOrder: number): Promise<void> {
    if (!this.llm) return;

    this.agentSpeaking = true;
    const form = await this.loadState();
    console.log('[SessionDO] Dispatching to LLM:', text);

    this.llm.generateReply(text, turnOrder, { ...form }, (msg: any) => {
      console.log('[SessionDO] LLM sending:', msg.type);
      this.broadcastVoice(msg);

      if (msg.type === 'ai_turn') {
        // LLM text stream is done — start TTS drain timer
        if (msg.text) {
          this.broadcastUI(
            '#voice-transcript',
            `<div class="transcript-line transcript-agent"><span class="transcript-role">Aíngel</span> ${this.esc(msg.text)}</div>`,
            'beforeend',
          );
        }
        this.scheduleTTSDrain(msg.text?.length ?? 0);
      }
    });
  }

  private scheduleTTSDrain(charCount: number): void {
    if (this.ttsDrainTimer) clearTimeout(this.ttsDrainTimer);
    // Estimate TTS playback: ~80ms per char, minimum 500ms
    const drainMs = Math.max(SessionDO.TTS_DRAIN_MS, charCount * 80);
    console.log('[SessionDO] TTS drain timer:', drainMs, 'ms for', charCount, 'chars');
    this.ttsDrainTimer = setTimeout(() => this.onAgentDoneSpeaking(), drainMs);
  }

  private onAgentDoneSpeaking(): void {
    this.agentSpeaking = false;
    this.ttsDrainTimer = null;

    if (this.bufferedTranscripts.length > 0) {
      // Combine all buffered user speech into one transcript
      const combined = this.bufferedTranscripts.join(' ');
      this.bufferedTranscripts = [];
      console.log('[SessionDO] Processing buffered transcript:', combined);
      // Use turnOrder 0 — the LLM doesn't really use it for ordering
      this.dispatchToLLM(combined, Date.now());
    }
  }

  // --- Voice Pipeline ---

  private async initVoicePipeline(ws: WebSocket): Promise<void> {
    console.log('[SessionDO] Initializing voice pipeline');

    const deepgramKey = this.env.DEEPGRAM_API_KEY;
    const geminiKey = this.env.GEMINI_AI_API_KEY;

    if (!deepgramKey || !geminiKey) {
      console.error('[SessionDO] Missing API keys:', { deepgram: !!deepgramKey, gemini: !!geminiKey });
      this.sendTo(ws, { type: 'error', message: 'Missing API keys for voice pipeline' });
      return;
    }

    // Initialize transcription service
    this.transcription = new TranscriptionService(deepgramKey);
    const connected = await this.transcription.connect({
      onTranscript: (text, isFinal, turnOrder) => {
        if (isFinal) {
          // Show user transcript in UI
          this.broadcastUI(
            '#voice-transcript',
            `<div class="transcript-line transcript-user"><span class="transcript-role">You</span> ${this.esc(text)}</div>`,
            'beforeend',
          );
          this.broadcastVoice({ type: 'user_turn', turnOrder, text });

          if (this.agentSpeaking) {
            // Buffer while agent is speaking — will be sent when TTS finishes
            console.log('[SessionDO] Buffering transcript (agent speaking):', text);
            this.bufferedTranscripts.push(text);
          } else {
            this.dispatchToLLM(text, turnOrder);
          }
        } else {
          this.broadcastUI('#voice-interim', this.esc(text));
        }
      },
      onEagerEndOfTurn: (text, _turnOrder) => {
        // Speculatively generate a response with the lite model
        if (this.llm && !this.agentSpeaking) {
          this.loadState().then((form) => {
            this.llm?.prepareEagerReply(text, { ...form });
          });
        }
      },
      onSpeechStart: () => {
        this.broadcastUI('#voice-interim', '');
      },
    });

    if (!connected) {
      this.sendTo(ws, { type: 'error', message: 'Failed to connect to Deepgram' });
      return;
    }

    // Initialize LLM service
    this.llm = new LLMService(geminiKey);
    this.llm.setToolContext({
      updateField: async (field: string, value: string) => {
        const form = await this.loadState();
        if (VALID_FIELDS.has(field as keyof FormState)) {
          (form as any)[field] = value;
          await this.saveState();
          this.broadcastFieldUpdate(field as keyof FormState, value);
          // Persist to D1 in background so page refresh shows latest data
          this.saveToD1().catch(() => {});
        }
      },
      completeOnboarding: async () => {
        const form = await this.loadState();
        if (!form.fullName) return 'Cannot complete: full name is required';
        await this.saveToD1();
        this.broadcastVoice({ type: 'onboarding_complete', form });
        this.broadcastUI(
          '#voice-status',
          '<span class="status-complete">✓ Profile saved</span>',
        );
        return 'Onboarding complete. Profile has been saved to the database.';
      },
    });

    this.voiceMode = true;

    // Signal ready via voice channel (client JS needs this to start audio capture)
    this.broadcastVoice({
      type: 'services_ready',
      stt: true,
      tts: true,
      sampleRate: 16000,
    });

    // Update UI status
    this.broadcastUI('#voice-status', '<span class="status-live">● Live</span>');

    console.log('[SessionDO] Voice pipeline ready');

    // Trigger welcome message — the LLM will greet the patient and confirm pre-filled info
    this.dispatchToLLM('[Session started. Welcome the patient with a brief 2-sentence introduction: who you are (Aíngel, their care companion) and that you\'re here to help fill in their profile. Then confirm any pre-filled information you can see in the form state.]', 0);
  }

  private stopVoicePipeline(): void {
    console.log('[SessionDO] Stopping voice pipeline');
    this.voiceMode = false;
    this.agentSpeaking = false;
    this.bufferedTranscripts = [];
    if (this.ttsDrainTimer) { clearTimeout(this.ttsDrainTimer); this.ttsDrainTimer = null; }
    if (this.transcription) {
      this.transcription.disconnect();
      this.transcription = null;
    }
    if (this.llm) {
      this.llm.disconnect();
      this.llm = null;
    }
  }
}
