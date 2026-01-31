// SessionDO — Durable Object for per-user onboarding form state + voice pipeline
// Keyed by user ID. Manages form fields, voice ASR/LLM pipeline, broadcasts to WebSocket clients.

import { TranscriptionService } from './services/transcription';
import { LLMService } from './services/llm';

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

const VALID_FIELDS = new Set<keyof FormState>(Object.keys(EMPTY_FORM) as (keyof FormState)[]);

export class SessionDO implements DurableObject {
  state: DurableObjectState;
  env: any;
  formState: FormState | null = null;

  // Voice pipeline services
  private transcription: TranscriptionService | null = null;
  private llm: LLMService | null = null;
  private voiceMode = false;

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

  private broadcast(message: object): void {
    const msg = JSON.stringify(message);
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(msg); } catch {}
    }
  }

  private sendTo(ws: WebSocket, message: object): void {
    try { ws.send(JSON.stringify(message)); } catch {}
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

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
      this.broadcast({ type: 'field_updated', field, value });
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
      this.broadcast({ type: 'form_reset', form: this.formState });
      return Response.json({ ok: true });
    }

    return Response.json({ status: 'ok', path: url.pathname });
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
            this.broadcast({ type: 'field_updated', field: data.field, value: data.value });
          }
          break;

        case 'stop_voice':
          this.stopVoicePipeline();
          break;

        default:
          this.sendTo(ws, { type: 'ack', received: data.type });
      }
    } catch {
      this.sendTo(ws, { type: 'error', message: 'Invalid JSON' });
    }
  }

  async webSocketClose(): Promise<void> {
    // If no more WebSocket clients, tear down voice pipeline
    const sockets = this.state.getWebSockets();
    if ([...sockets].length === 0) {
      this.stopVoicePipeline();
    }
  }

  // --- Voice Pipeline ---

  private async initVoicePipeline(ws: WebSocket): Promise<void> {
    console.log('[SessionDO] Initializing voice pipeline');

    const deepgramKey = this.env.DEEPGRAM_API_KEY;
    const geminiKey = this.env.GEMINI_AI_API_KEY;

    if (!deepgramKey || !geminiKey) {
      this.sendTo(ws, { type: 'error', message: 'Missing API keys for voice pipeline' });
      return;
    }

    // Initialize transcription service
    this.transcription = new TranscriptionService(deepgramKey);
    const connected = await this.transcription.connect({
      onTranscript: (text, isFinal, turnOrder) => {
        if (isFinal) {
          // Send user turn to all clients
          this.broadcast({ type: 'user_turn', turnOrder, text });
          // Feed to LLM
          if (this.llm) {
            this.llm.generateReply(text, turnOrder, (msg: any) => this.broadcast(msg));
          }
        } else {
          // Interim transcript
          this.broadcast({ type: 'interim_transcript', text });
        }
      },
      onSpeechStart: () => {
        // Interrupt current LLM generation
        if (this.llm) {
          this.llm.abortCurrent();
        }
        this.broadcast({ type: 'start_of_turn' });
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
          this.broadcast({ type: 'field_updated', field, value });
        }
      },
      getFormState: async () => {
        const form = await this.loadState();
        return { ...form };
      },
      completeOnboarding: async () => {
        const form = await this.loadState();
        if (!form.fullName) return 'Cannot complete: full name is required';
        this.broadcast({ type: 'onboarding_complete', form });
        return 'Onboarding complete';
      },
    });

    this.voiceMode = true;

    // Signal ready
    this.sendTo(ws, {
      type: 'services_ready',
      stt: true,
      tts: true,
      sampleRate: 16000,
    });

    console.log('[SessionDO] Voice pipeline ready');
  }

  private stopVoicePipeline(): void {
    console.log('[SessionDO] Stopping voice pipeline');
    this.voiceMode = false;
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
