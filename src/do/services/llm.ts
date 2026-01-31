import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, type ToolSet } from 'ai';

const SYSTEM_PROMPT = `You are Aíngel, a warm and caring AI companion helping patients get set up with their care profile. You're having a natural voice conversation.

Your goal is to fill in the patient's onboarding form by chatting with them naturally. You have these tools:
- fill_field(field, value): Fill a form field. Fields: fullName, email, phone, age, physical, mental
- complete_onboarding(): Mark onboarding as complete when all fields are filled

Guidelines:
- Be warm, patient, and reassuring
- Ask one question at a time
- Confirm information back to the patient ("So your name is John Smith?")
- Speech-to-text may mishear — ask for spelling of names, repeat phone numbers digit by digit
- Keep responses to 1-2 sentences
- Start by greeting the patient and asking their name`;

export type TextDeltaCallback = (text: string, isEnd: boolean, turnOrder: number) => void;

export interface LLMToolContext {
  updateField: (field: string, value: string) => Promise<void>;
  getFormState: () => Promise<Record<string, string>>;
  completeOnboarding: () => Promise<string>;
}

export class LLMService {
  private history: { role: 'user' | 'assistant'; text: string }[] = [];
  private currentAbortController: AbortController | null = null;
  private textDeltaCallback: TextDeltaCallback | null = null;
  private toolContext: LLMToolContext | null = null;

  constructor(private apiKey: string) {}

  setTextDeltaCallback(cb: TextDeltaCallback | null) {
    this.textDeltaCallback = cb;
  }

  setToolContext(ctx: LLMToolContext) {
    this.toolContext = ctx;
  }

  abortCurrent() {
    try { this.currentAbortController?.abort(); } catch {}
  }

  private buildTools(): ToolSet {
    const ctx = this.toolContext;
    return {
      fill_field: {
        description: 'Fill a form field with information from the patient',
        parameters: {
          type: 'object',
          properties: {
            field: {
              type: 'string',
              enum: ['fullName', 'email', 'phone', 'age', 'physical', 'mental'],
              description: 'The form field to fill',
            },
            value: {
              type: 'string',
              description: 'The value to set',
            },
          },
          required: ['field', 'value'],
        },
        execute: async ({ field, value }: { field: string; value: string }) => {
          console.log('[LLM] fill_field:', field, '=', value);
          if (ctx) await ctx.updateField(field, value);
          return `Set ${field} to "${value}"`;
        },
      },
      complete_onboarding: {
        description: 'Mark onboarding as complete when all required fields are filled',
        parameters: { type: 'object', properties: {} },
        execute: async () => {
          console.log('[LLM] complete_onboarding');
          if (ctx) return await ctx.completeOnboarding();
          return 'Onboarding complete';
        },
      },
    };
  }

  async generateReply(userTranscript: string, turnOrder: number, sendMessage: (data: any) => void) {
    try {
      this.history.push({ role: 'user', text: userTranscript });
      if (this.history.length > 16) this.history.splice(0, this.history.length - 16);

      // Build context with form state
      let formContext = '';
      if (this.toolContext) {
        const form = await this.toolContext.getFormState();
        const filled = Object.entries(form).filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`);
        const empty = Object.entries(form).filter(([_, v]) => !v).map(([k]) => k);
        formContext = `\n\nCurrent form state:\nFilled: ${filled.length ? filled.join(', ') : 'none'}\nStill needed: ${empty.join(', ')}`;
      }

      const promptEntries = this.history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');

      const model = createGoogleGenerativeAI({ apiKey: this.apiKey })('gemini-2.0-flash');
      const abortController = new AbortController();
      this.currentAbortController = abortController;

      const tools = this.buildTools();

      const { textStream } = streamText({
        model,
        system: SYSTEM_PROMPT + formContext,
        prompt: promptEntries,
        temperature: 0.6,
        tools,
        maxSteps: 5,
        abortSignal: abortController.signal as any,
      });

      let reply = '';
      let started = false;

      try {
        for await (const text of textStream) {
          if (!started) {
            started = true;
            sendMessage({ type: 'ai_turn_start', turnOrder });
          }

          reply += text;

          // Send text delta to client
          if (this.textDeltaCallback) {
            this.textDeltaCallback(text, false, turnOrder);
          }
          sendMessage({ type: 'text_delta', text, isEnd: false, turnOrder });
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          console.log('[LLM] Generation aborted', { turnOrder });
        } else {
          throw e;
        }
      } finally {
        this.currentAbortController = null;
      }

      // Final delta
      sendMessage({ type: 'text_delta', text: '', isEnd: true, turnOrder });
      if (this.textDeltaCallback) {
        this.textDeltaCallback('', true, turnOrder);
      }

      // Record assistant response
      if (reply) {
        this.history.push({ role: 'assistant', text: reply });
        if (this.history.length > 16) this.history.splice(0, this.history.length - 16);
      }

      sendMessage({ type: 'ai_turn', turnOrder, text: reply });

      console.log('[LLM] Reply complete', { turnOrder, len: reply.length });
    } catch (error) {
      console.error('[LLM] generateReply failed:', error);
      sendMessage({ type: 'ai_turn', turnOrder, text: '[Error generating response]' });
    }
  }

  disconnect() {
    this.abortCurrent();
  }
}
