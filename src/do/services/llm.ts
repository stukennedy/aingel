import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, generateText, tool, type CoreMessage, jsonSchema } from 'ai';

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

  // Eager response state
  private eagerAbortController: AbortController | null = null;
  private eagerReply: string | null = null;
  private eagerTranscript: string | null = null;
  private eagerPromise: Promise<void> | null = null;

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

  private abortEager() {
    try { this.eagerAbortController?.abort(); } catch {}
    this.eagerAbortController = null;
    this.eagerPromise = null;
  }

  private buildFormContext(formState: Record<string, string>): string {
    const filled = Object.entries(formState).filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`);
    const empty = Object.entries(formState).filter(([_, v]) => !v).map(([k]) => k);
    return `\n\nCurrent form state:\nFilled: ${filled.length ? filled.join(', ') : 'none'}\nStill needed: ${empty.join(', ')}`;
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
        execute: async (args: any) => {
          const { field, value } = args as { field: string; value: string };
          console.log('[LLM] fill_field:', field, '=', value);
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

  /**
   * Speculatively generate a text-only response using the lite model.
   * Called on eager end-of-turn (is_final before speech_final).
   * Result is cached and used if the transcript matches at confirmed EOT.
   */
  prepareEagerReply(transcript: string, formState: Record<string, string>): void {
    // Abort any previous eager generation
    this.abortEager();

    this.eagerTranscript = transcript;
    this.eagerReply = null;

    const abortController = new AbortController();
    this.eagerAbortController = abortController;

    this.eagerPromise = (async () => {
      try {
        const model = createGoogleGenerativeAI({ apiKey: this.apiKey })('gemini-2.5-flash-lite');
        const formContext = this.buildFormContext(formState);

        const eagerMessages: CoreMessage[] = [
          ...this.messages,
          { role: 'user', content: transcript },
        ];

        console.log('[LLM-Lite] Eager generation for:', transcript.slice(0, 60));

        const result = await generateText({
          model,
          system: SYSTEM_PROMPT + formContext,
          messages: eagerMessages,
          temperature: 0.6,
          abortSignal: abortController.signal as any,
        });

        // Only cache if not aborted and transcript still matches
        if (this.eagerTranscript === transcript) {
          this.eagerReply = result.text;
          console.log('[LLM-Lite] Eager reply ready:', result.text.slice(0, 80));
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          console.error('[LLM-Lite] Eager generation error:', e?.message || e);
        }
      } finally {
        this.eagerPromise = null;
      }
    })();
  }

  /**
   * Generate the full response. If an eager reply is available and the transcript
   * matches, stream that immediately and then run tool-calling with the full model.
   */
  async generateReply(userTranscript: string, turnOrder: number, formState: Record<string, string>, sendMessage: (data: any) => void) {
    try {
      this.messages.push({ role: 'user', content: userTranscript });
      if (this.messages.length > 16) {
        this.messages = this.messages.slice(-16);
      }

      const formContext = this.buildFormContext(formState);

      // If eager generation is in-flight for this transcript, wait for it (with timeout)
      if (this.eagerPromise && this.eagerTranscript === userTranscript) {
        console.log('[LLM] Waiting for in-flight eager generation...');
        await Promise.race([this.eagerPromise, new Promise(r => setTimeout(r, 3000))]);
      } else {
        // Transcript changed or no eager — abort any stale eager
        this.abortEager();
      }

      // Check if we have a usable eager reply
      const hasEagerReply = this.eagerReply && this.eagerTranscript === userTranscript;
      const eagerText = hasEagerReply ? this.eagerReply! : null;
      this.eagerReply = null;
      this.eagerTranscript = null;
      this.eagerPromise = null;

      if (eagerText) {
        // Stream the pre-computed eager reply immediately
        console.log('[LLM] Using eager reply:', eagerText.slice(0, 80));
        sendMessage({ type: 'ai_turn_start', turnOrder });
        sendMessage({ type: 'text_delta', text: eagerText, isEnd: false, turnOrder });
        if (this.textDeltaCallback) {
          this.textDeltaCallback(eagerText, false, turnOrder);
        }
        sendMessage({ type: 'text_delta', text: '', isEnd: true, turnOrder });
        if (this.textDeltaCallback) {
          this.textDeltaCallback('', true, turnOrder);
        }

        // Record in history
        this.messages.push({ role: 'assistant', content: eagerText });
        if (this.messages.length > 16) {
          this.messages = this.messages.slice(-16);
        }

        sendMessage({ type: 'ai_turn', turnOrder, text: eagerText });
        console.log('[LLM] Eager reply sent, now running tool pass');

        // Run tool-calling pass with the full model (non-streaming, fire-and-forget for tools)
        this.runToolPass(userTranscript, formContext);
        return;
      }

      // No eager reply available — full streaming generation with the main model
      console.log('[LLM] No eager reply, full generation for turn', turnOrder);
      await this.streamFullReply(userTranscript, turnOrder, formContext, sendMessage);
    } catch (error) {
      console.error('[LLM] generateReply failed:', error);
      sendMessage({ type: 'ai_turn', turnOrder, text: '[Error generating response]' });
    }
  }

  /**
   * Full streaming reply with tools — used when no eager reply is available.
   */
  private async streamFullReply(userTranscript: string, turnOrder: number, formContext: string, sendMessage: (data: any) => void) {
    const model = createGoogleGenerativeAI({ apiKey: this.apiKey })('gemini-2.0-flash');
    const abortController = new AbortController();
    this.currentAbortController = abortController;

    const tools = this.buildTools();

    console.log('[LLM] Starting streamText for turn', turnOrder, 'transcript:', userTranscript);

    const result = streamText({
      model,
      system: SYSTEM_PROMPT + formContext,
      messages: this.messages,
      temperature: 0.6,
      tools,
      maxSteps: 5,
      abortSignal: abortController.signal as any,
    });

    let reply = '';
    let started = false;

    try {
      for await (const part of result.fullStream) {
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

    sendMessage({ type: 'text_delta', text: '', isEnd: true, turnOrder });
    if (this.textDeltaCallback) {
      this.textDeltaCallback('', true, turnOrder);
    }

    if (reply) {
      this.messages.push({ role: 'assistant', content: reply });
      if (this.messages.length > 16) {
        this.messages = this.messages.slice(-16);
      }
    }

    sendMessage({ type: 'ai_turn', turnOrder, text: reply });
    console.log('[LLM] Reply complete', { turnOrder, len: reply.length });
  }

  /**
   * Background tool-calling pass with the full model.
   * Runs after eager reply has been sent — processes any tool calls
   * (form filling, completion) without generating more speech text.
   */
  private async runToolPass(userTranscript: string, formContext: string) {
    try {
      const model = createGoogleGenerativeAI({ apiKey: this.apiKey })('gemini-2.0-flash');
      const tools = this.buildTools();

      // Ask the full model to process tool calls only, given the conversation so far
      const toolMessages: CoreMessage[] = [
        ...this.messages,
        {
          role: 'user',
          content: `[SYSTEM: You already responded to the user with spoken text. Now determine if any tool calls are needed based on the user's message: "${userTranscript}". If no tools are needed, respond with just "ok". Do NOT generate spoken text — only call tools if appropriate.]`,
        },
      ];

      console.log('[LLM-Tools] Running tool pass for:', userTranscript.slice(0, 60));

      const result = await generateText({
        model,
        system: SYSTEM_PROMPT + formContext,
        messages: toolMessages,
        temperature: 0.3,
        tools,
        maxSteps: 5,
      });

      console.log('[LLM-Tools] Tool pass complete, tool calls:', result.toolCalls?.length ?? 0);
    } catch (e: any) {
      console.error('[LLM-Tools] Tool pass error:', e?.message || e);
    }
  }

  disconnect() {
    this.abortCurrent();
    this.abortEager();
  }
}
