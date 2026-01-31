import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, tool, type CoreMessage, jsonSchema } from 'ai';

const SYSTEM_PROMPT = `You are Aíngel (pronounced "angel"), a warm AI companion speaking directly to an elderly patient to help fill in their care profile.

Tools:
- fill_field(field, value): Fill a form field. Fields: fullName, email, phone, age, physical, mental
- complete_onboarding(): Mark onboarding complete when all required fields are filled

Rules:
- You are speaking to an elderly person. Be warm, clear, and patient. Use simple language.
- Keep responses to 1-2 short sentences. This is spoken aloud — brevity is kindness.
- ALWAYS end with a question to keep the conversation moving.
- Ask one thing at a time. Move on quickly once answered.
- Call fill_field immediately when you hear information — don't wait to confirm obvious details. Only confirm if something sounds ambiguous.
- Speech-to-text may mishear — ask for spelling only for unusual names, repeat phone numbers back.
- ALWAYS include spoken text alongside tool calls. Never respond with only tool calls.
- If some fields are already filled (from signup), confirm them first: "I see your name is X and email is Y — is that right?" Then move on to empty fields.
- For "physical" (Physical Health): gently ask about any health conditions, mobility issues, or medications. Guide them: "Do you have any health conditions I should know about, like diabetes or heart problems?"
- For "mental" (Emotional Wellbeing): be especially gentle. Ask how they've been feeling lately, if they feel lonely or worried. Example: "How have you been feeling in yourself lately? Are you generally in good spirits?"
- When all fields are filled, ask if everything looks correct before completing.
- Once the user confirms everything is correct, call complete_onboarding, thank them, say their info is saved, and say goodbye warmly — "I look forward to our next chat" or similar. Do NOT end the session yourself.
- After saying goodbye, keep responding naturally if the user keeps talking. Only when the user says goodbye (or similar farewell), respond with a final short goodbye and nothing else.`;

export type TextDeltaCallback = (text: string, isEnd: boolean, turnOrder: number) => void;

export interface LLMToolContext {
  updateField: (field: string, value: string) => Promise<void>;
  completeOnboarding: () => Promise<string>;
}

export class LLMService {
  private messages: CoreMessage[] = [];
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

  private buildTools() {
    const ctx = this.toolContext;
    return {
      fill_field: tool({
        description: 'Fill a form field with information from the patient. ALWAYS include a spoken text response alongside tool calls. Valid fields: fullName, email, phone, age, physical, mental.',
        parameters: jsonSchema({
          type: 'object',
          properties: {
            field: { type: 'string', description: 'The form field to fill. Must be one of: fullName, email, phone, age, physical, mental' },
            value: { type: 'string', description: 'The value to set' },
          },
          required: ['field', 'value'],
        }),
        execute: async ({ field, value }: { field: string; value: string }) => {
          console.log('[LLM] fill_field:', field, '=', value);
          // Fire-and-forget — don't block text generation while form updates
          if (ctx) ctx.updateField(field, value).catch((e) => console.error('[LLM] fill_field error:', e));
          return `Done.`;
        },
      }),
      complete_onboarding: tool({
        description: 'Mark onboarding as complete when all required fields are filled',
        parameters: jsonSchema({
          type: 'object',
          properties: {
            confirm: { type: 'string', description: 'Set to "yes" to confirm completion' },
          },
          required: ['confirm'],
        }),
        execute: async () => {
          console.log('[LLM] complete_onboarding');
          if (ctx) return await ctx.completeOnboarding();
          return 'Onboarding complete';
        },
      }),
    };
  }

  async generateReply(userTranscript: string, turnOrder: number, formState: Record<string, string>, sendMessage: (data: any) => void) {
    try {
      this.messages.push({ role: 'user', content: userTranscript });

      if (this.messages.length > 16) {
        this.messages = this.messages.slice(-16);
      }

      // Build form context from current state
      const filled = Object.entries(formState).filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`);
      const empty = Object.entries(formState).filter(([_, v]) => !v).map(([k]) => k);
      const formContext = `\n\nCurrent form state:\nFilled: ${filled.length ? filled.join(', ') : 'none'}\nStill needed: ${empty.join(', ')}`;

      const model = createGoogleGenerativeAI({ apiKey: this.apiKey })('gemini-2.0-flash');
      const abortController = new AbortController();
      this.currentAbortController = abortController;

      const tools = this.buildTools();

      console.log('[LLM] Starting streamText for turn', turnOrder, 'transcript:', userTranscript);
      console.log('[LLM] Message count:', this.messages.length);

      const result = streamText({
        model,
        system: SYSTEM_PROMPT + formContext,
        messages: this.messages,
        temperature: 0.6,
        tools,
        maxSteps: 5,
        abortSignal: abortController.signal as any,
        onStepFinish: ({ text, toolCalls, toolResults }) => {
          console.log('[LLM] Step finished:', {
            textLen: text.length,
            toolCalls: toolCalls?.length ?? 0,
            toolResults: toolResults?.length ?? 0,
          });
        },
      });

      let reply = '';
      let started = false;

      try {
        // Use fullStream to see everything (text, tool calls, errors, etc.)
        for await (const part of result.fullStream) {
          console.log('[LLM] Stream part:', part.type);

          if (part.type === 'text-delta' && part.textDelta) {
            if (!started) {
              started = true;
              sendMessage({ type: 'ai_turn_start', turnOrder });
            }

            reply += part.textDelta;

            if (this.textDeltaCallback) {
              this.textDeltaCallback(part.textDelta, false, turnOrder);
            }
            sendMessage({ type: 'text_delta', text: part.textDelta, isEnd: false, turnOrder });
          } else if (part.type === 'tool-call') {
            console.log('[LLM] Tool call:', part.toolName, JSON.stringify(part.args));
          } else if (part.type === 'tool-result') {
            console.log('[LLM] Tool result:', part.toolName, typeof part.result === 'string' ? part.result.slice(0, 100) : part.result);
          } else if (part.type === 'error') {
            console.error('[LLM] Stream error part:', part.error);
          } else if (part.type === 'step-finish') {
            console.log('[LLM] Step finish:', {
              finishReason: part.finishReason,
              isContinued: part.isContinued,
            });
          } else if (part.type === 'finish') {
            console.log('[LLM] Finish:', { finishReason: part.finishReason });
          }
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          console.log('[LLM] Generation aborted', { turnOrder });
        } else {
          console.error('[LLM] Stream iteration error:', e?.message || e);
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

      // Record assistant response in history
      if (reply) {
        this.messages.push({ role: 'assistant', content: reply });
        if (this.messages.length > 16) {
          this.messages = this.messages.slice(-16);
        }
      }

      sendMessage({ type: 'ai_turn', turnOrder, text: reply });

      console.log('[LLM] Reply complete', { turnOrder, len: reply.length, reply: reply.slice(0, 100) });
    } catch (error) {
      console.error('[LLM] generateReply failed:', error);
      sendMessage({ type: 'ai_turn', turnOrder, text: '[Error generating response]' });
    }
  }

  disconnect() {
    this.abortCurrent();
  }
}
