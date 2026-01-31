/**
 * Anam Session - Client orchestrator for voice onboarding
 * Connects to Anam for avatar rendering/TTS and our voice agent for STT/LLM
 */

import { createClient, AnamEvent } from '@anam-ai/js-sdk';
import type { AnamClient } from '@anam-ai/js-sdk';
import { AudioCapture } from './audio-capture';

type TalkMessageStream = ReturnType<AnamClient['createTalkMessageStream']>;

export type SessionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SessionCallbacks {
  onStatusChange?: (status: SessionStatus) => void;
  onUserTranscript?: (text: string) => void;
  onAgentText?: (text: string) => void;
  onFieldUpdated?: (field: string, value: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

interface ServerMessage {
  type: string;
  text?: string;
  isEnd?: boolean;
  turnOrder?: number;
  timestamp?: number;
  error?: string;
  message?: string;
  sampleRate?: number;
  field?: string;
  value?: string;
}

export class AnamSession {
  private anamClient: AnamClient | null = null;
  private ws: WebSocket | null = null;
  private talkStream: TalkMessageStream | null = null;
  private audioCapture: AudioCapture | null = null;
  private status: SessionStatus = 'disconnected';
  private callbacks: SessionCallbacks = {};
  private currentAgentText = '';
  private pendingMicDeviceId?: string;
  private sampleRate: number = 16000;
  private ttsStartTime: number | null = null;
  private static readonly TTS_MS_PER_CHAR = 80;

  constructor(callbacks?: SessionCallbacks) {
    this.callbacks = callbacks || {};
  }

  async connect(videoElementId: string, microphoneDeviceId?: string): Promise<void> {
    if (this.status === 'connecting' || this.status === 'connected') {
      console.warn('[AnamSession] Already connecting or connected');
      return;
    }

    this.setStatus('connecting');

    try {
      // 1. Get session token
      console.log('[AnamSession] Fetching session token...');
      const tokenResponse = await fetch('/api/anam-token', { method: 'POST' });
      if (!tokenResponse.ok) {
        throw new Error(`Failed to get session token: ${tokenResponse.status}`);
      }

      const data = (await tokenResponse.json()) as { sessionToken?: string };
      if (!data.sessionToken) {
        throw new Error('No session token received');
      }

      // 2. Initialize Anam client
      console.log('[AnamSession] Initializing Anam client...');
      this.anamClient = createClient(data.sessionToken);

      // 3. Set up Anam event listeners
      this.anamClient.addListener(AnamEvent.CONNECTION_ESTABLISHED, () => {
        console.log('[AnamSession] Anam connection established');
      });

      this.anamClient.addListener(AnamEvent.SESSION_READY, () => {
        console.log('[AnamSession] Anam session ready');
      });

      this.anamClient.addListener(AnamEvent.TALK_STREAM_INTERRUPTED, () => {
        let heardText: string | undefined;
        if (this.ttsStartTime && this.currentAgentText) {
          const elapsedMs = Date.now() - this.ttsStartTime;
          const estimatedChars = Math.floor(elapsedMs / AnamSession.TTS_MS_PER_CHAR);
          heardText = this.currentAgentText.slice(0, estimatedChars);
        }
        this.talkStream = null;
        this.ttsStartTime = null;
        this.sendToServer({
          type: 'anam_tts_interrupted',
          timestamp: Date.now(),
          heardText,
          fullText: this.currentAgentText || undefined,
        });
      });

      this.anamClient.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, () => {
        this.sendToServer({ type: 'anam_tts_ended', timestamp: Date.now() });
      });

      this.anamClient.addListener(AnamEvent.CONNECTION_CLOSED, () => {
        if (this.status === 'connected') {
          this.disconnect();
        }
      });

      // 4. Start streaming to video element (null = no mic access by Anam)
      await this.anamClient.streamToVideoElement(videoElementId, null as any);

      // 5. Mute Anam's input audio — we handle STT ourselves
      this.anamClient.muteInputAudio();

      // 6. Connect to voice agent WebSocket
      this.pendingMicDeviceId = microphoneDeviceId;
      await this.connectWebSocket();

      this.setStatus('connected');
      console.log('[AnamSession] Fully connected');
    } catch (error) {
      console.error('[AnamSession] Connection failed:', error);
      this.setStatus('error');
      this.callbacks.onError?.(error as Error);
      this.disconnect();
      throw error;
    }
  }

  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/api/session/ws`;

      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => reject(new Error('WebSocket timeout')), 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.ws!.send(JSON.stringify({ type: 'hello', mode: 'anam' }));
        resolve();
      };

      this.ws.onmessage = (event) => this.handleServerMessage(event);

      this.ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('WebSocket connection error'));
      };

      this.ws.onclose = () => {
        if (this.status === 'connected') {
          this.disconnect();
        }
      };
    });
  }

  private handleServerMessage(event: MessageEvent): void {
    if (event.data instanceof ArrayBuffer || event.data instanceof Blob) return;
    if (typeof event.data !== 'string') return;

    try {
      const msg: ServerMessage = JSON.parse(event.data);

      switch (msg.type) {
        case 'services_ready':
          console.log('[AnamSession] Services ready, sampleRate:', msg.sampleRate);
          if (msg.sampleRate) this.sampleRate = msg.sampleRate;
          this.startAudioCapture();
          break;

        case 'text_delta':
          this.handleTextDelta(msg.text || '', msg.isEnd || false);
          break;

        case 'start_of_turn':
          // User started speaking — interrupt avatar
          if (this.ttsStartTime && this.currentAgentText) {
            const elapsedMs = Date.now() - this.ttsStartTime;
            const estimatedChars = Math.floor(elapsedMs / AnamSession.TTS_MS_PER_CHAR);
            this.sendToServer({
              type: 'anam_tts_interrupted',
              timestamp: Date.now(),
              heardText: this.currentAgentText.slice(0, estimatedChars),
              fullText: this.currentAgentText,
            });
          }
          this.anamClient?.interruptPersona();
          this.talkStream = null;
          this.ttsStartTime = null;
          this.currentAgentText = '';
          break;

        case 'user_turn':
          this.callbacks.onUserTranscript?.(msg.text || '');
          break;

        case 'ai_turn_start':
          this.currentAgentText = '';
          break;

        case 'ai_turn':
          // Full AI response complete
          break;

        case 'field_updated':
          if (msg.field && msg.value !== undefined) {
            this.callbacks.onFieldUpdated?.(msg.field, msg.value);
          }
          break;

        case 'onboarding_complete':
          this.callbacks.onComplete?.();
          break;

        case 'error':
          console.error('[AnamSession] Server error:', msg.error || msg.message);
          this.callbacks.onError?.(new Error(msg.error || msg.message || 'Unknown error'));
          break;
      }
    } catch (error) {
      console.warn('[AnamSession] Failed to parse message:', error);
    }
  }

  private async startAudioCapture(): Promise<void> {
    if (this.audioCapture || !this.ws) return;

    try {
      this.audioCapture = new AudioCapture(this.ws, this.sampleRate);
      await this.audioCapture.start(this.pendingMicDeviceId);
      this.pendingMicDeviceId = undefined;
    } catch (error) {
      console.error('[AnamSession] Failed to start audio capture:', error);
      this.callbacks.onError?.(error as Error);
    }
  }

  private handleTextDelta(text: string, isEnd: boolean): void {
    if (!this.anamClient) return;

    if (!this.talkStream) {
      this.talkStream = this.anamClient.createTalkMessageStream();
      this.ttsStartTime = Date.now();
      this.currentAgentText = '';
    }

    if (this.talkStream.isActive()) {
      this.talkStream.streamMessageChunk(text, isEnd);
      this.currentAgentText += text;
      if (text) this.callbacks.onAgentText?.(this.currentAgentText);
    }

    if (isEnd) {
      this.talkStream = null;
      this.ttsStartTime = null;
    }
  }

  private setStatus(status: SessionStatus): void {
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }

  getStatus(): SessionStatus {
    return this.status;
  }

  private sendToServer(data: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect(): void {
    if (this.status === 'disconnected') return;

    console.log('[AnamSession] Disconnecting...');
    this.status = 'disconnected';

    if (this.audioCapture) {
      this.audioCapture.stop();
      this.audioCapture = null;
    }

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Client disconnecting');
      }
      this.ws = null;
    }

    if (this.anamClient) {
      try { this.anamClient.stopStreaming(); } catch {}
      this.anamClient = null;
    }

    this.talkStream = null;
    this.currentAgentText = '';
    this.callbacks.onStatusChange?.('disconnected');
  }
}
