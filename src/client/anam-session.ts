/**
 * Anam Session - Client orchestrator for voice onboarding
 * Manages Anam avatar (video rendering + TTS) and AudioCapture (mic → server).
 * WebSocket is managed externally by HTMX hx-ws; this class receives voice
 * channel messages via public methods.
 */

import { createClient, AnamEvent } from '@anam-ai/js-sdk';
import type { AnamClient } from '@anam-ai/js-sdk';
import { AudioCapture } from './audio-capture';

type TalkMessageStream = ReturnType<AnamClient['createTalkMessageStream']>;

export type SessionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SessionCallbacks {
  onStatusChange?: (status: SessionStatus) => void;
  onError?: (error: Error) => void;
}

export class AnamSession {
  private anamClient: AnamClient | null = null;
  private audioCapture: AudioCapture | null = null;
  private talkStream: TalkMessageStream | null = null;
  private status: SessionStatus = 'disconnected';
  private callbacks: SessionCallbacks = {};
  private currentAgentText = '';
  private ttsStartTime: number | null = null;
  private static readonly TTS_MS_PER_CHAR = 80;

  constructor(callbacks?: SessionCallbacks) {
    this.callbacks = callbacks || {};
  }

  /**
   * Connect to Anam avatar only (video + TTS).
   * Does NOT establish the server WebSocket — that's handled by HTMX hx-ws.
   */
  async connect(videoElementId: string): Promise<void> {
    if (this.status === 'connecting' || this.status === 'connected') return;

    this.setStatus('connecting');

    try {
      // 1. Get session token
      const tokenResponse = await fetch('/api/anam-token', { method: 'POST' });
      if (!tokenResponse.ok) {
        throw new Error(`Failed to get session token: ${tokenResponse.status}`);
      }

      const data = (await tokenResponse.json()) as { sessionToken?: string };
      if (!data.sessionToken) {
        throw new Error('No session token received');
      }

      // 2. Initialize Anam client
      this.anamClient = createClient(data.sessionToken);

      // 3. Event listeners
      this.anamClient.addListener(AnamEvent.CONNECTION_ESTABLISHED, () => {
        console.log('[AnamSession] Anam connection established');
      });

      this.anamClient.addListener(AnamEvent.TALK_STREAM_INTERRUPTED, () => {
        this.talkStream = null;
        this.ttsStartTime = null;
      });

      this.anamClient.addListener(AnamEvent.CONNECTION_CLOSED, () => {
        if (this.status === 'connected') {
          this.disconnect();
        }
      });

      // 4. Start streaming to video element (null = no mic access by Anam)
      await this.anamClient.streamToVideoElement(videoElementId, null as any);

      // 5. Mute Anam's input audio — we handle STT ourselves via Deepgram
      this.anamClient.muteInputAudio();

      this.setStatus('connected');
      console.log('[AnamSession] Anam connected');
    } catch (error) {
      console.error('[AnamSession] Connection failed:', error);
      this.setStatus('error');
      this.callbacks.onError?.(error as Error);
      this.disconnect();
      throw error;
    }
  }

  /**
   * Called when server signals voice pipeline is ready.
   * Starts mic audio capture and sends binary chunks to the server WebSocket.
   */
  onServicesReady(ws: WebSocket, sampleRate: number): void {
    if (this.audioCapture) return;

    this.audioCapture = new AudioCapture(ws, sampleRate);
    this.audioCapture.start().catch((err) => {
      console.error('[AnamSession] Audio capture failed:', err);
      this.callbacks.onError?.(err);
    });
  }

  /**
   * Called when server sends a text_delta (LLM streaming response).
   * Streams text to Anam avatar for TTS.
   */
  handleTextDelta(text: string, isEnd: boolean): void {
    if (!this.anamClient) return;

    if (!this.talkStream) {
      this.talkStream = this.anamClient.createTalkMessageStream();
      this.ttsStartTime = Date.now();
      this.currentAgentText = '';
    }

    if (this.talkStream.isActive()) {
      this.talkStream.streamMessageChunk(text, isEnd);
      this.currentAgentText += text;
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

  disconnect(): void {
    if (this.status === 'disconnected') return;

    console.log('[AnamSession] Disconnecting...');
    this.status = 'disconnected';

    if (this.audioCapture) {
      this.audioCapture.stop();
      this.audioCapture = null;
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
