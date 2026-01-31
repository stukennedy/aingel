import { connectWebSocketUpgrade } from '@/utils/ws-upgrade';

export interface TranscriptionCallbacks {
  onTranscript: (text: string, isFinal: boolean, turnOrder: number) => void;
  /** Fires on is_final segments before speech_final — use for eager/speculative processing */
  onEagerEndOfTurn?: (text: string, turnOrder: number) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
}

export class TranscriptionService {
  private deepgramWs: WebSocket | null = null;
  private isConnected = false;
  private currentTurnOrder = 0;
  private currentTranscript = '';
  private callbacks: TranscriptionCallbacks | null = null;

  constructor(private apiKey: string) {}

  async connect(callbacks: TranscriptionCallbacks): Promise<boolean> {
    this.callbacks = callbacks;

    const params = new URLSearchParams({
      model: 'nova-2',
      language: 'en',
      smart_format: 'true',
      endpointing: '300',
      interim_results: 'true',
      sample_rate: '16000',
      encoding: 'linear16',
      channels: '1',
      vad_events: 'true',
      utterance_end_ms: '1000',
    });

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    try {
      this.deepgramWs = await connectWebSocketUpgrade(url, {
        binaryType: 'arraybuffer',
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
      });

      this.isConnected = true;
      console.log('[Transcription] Connected to Deepgram');

      this.deepgramWs.addEventListener('message', (event: MessageEvent) => {
        try {
          const data = typeof event.data === 'string'
            ? JSON.parse(event.data)
            : JSON.parse(new TextDecoder().decode(event.data));
          this.handleMessage(data);
        } catch (e) {
          console.error('[Transcription] Parse error:', e);
        }
      });

      this.deepgramWs.addEventListener('close', (event: CloseEvent) => {
        console.log('[Transcription] Deepgram closed:', event.code, event.reason);
        this.isConnected = false;
      });

      this.deepgramWs.addEventListener('error', (error: Event) => {
        console.error('[Transcription] Deepgram error:', error);
      });

      return true;
    } catch (error) {
      console.error('[Transcription] Failed to connect:', error);
      return false;
    }
  }

  private handleMessage(data: any) {
    // Nova-2 uses results format
    if (data.type === 'Results') {
      const alt = data.channel?.alternatives?.[0];
      if (!alt) return;

      const transcript = alt.transcript || '';
      const isFinal = data.is_final === true;
      const speechFinal = data.speech_final === true;

      if (!transcript) return;

      if (isFinal) {
        this.currentTranscript += (this.currentTranscript ? ' ' : '') + transcript;
        // Eager EOT: segment is final but utterance may continue — speculative processing
        if (this.currentTranscript) {
          this.callbacks?.onEagerEndOfTurn?.(this.currentTranscript, this.currentTurnOrder);
        }
      }

      // Send interim updates
      if (!isFinal) {
        this.callbacks?.onTranscript(transcript, false, this.currentTurnOrder);
        return;
      }

      // speech_final means end of utterance (endpointing triggered)
      if (speechFinal && this.currentTranscript) {
        console.log('[Transcription] Final transcript:', this.currentTranscript);
        this.callbacks?.onTranscript(this.currentTranscript, true, this.currentTurnOrder);
        this.currentTurnOrder++;
        this.currentTranscript = '';
      }
    } else if (data.type === 'UtteranceEnd') {
      // Backup: utterance_end_ms triggered
      if (this.currentTranscript) {
        console.log('[Transcription] Utterance end:', this.currentTranscript);
        this.callbacks?.onTranscript(this.currentTranscript, true, this.currentTurnOrder);
        this.currentTurnOrder++;
        this.currentTranscript = '';
      }
    } else if (data.type === 'SpeechStarted') {
      console.log('[Transcription] Speech started');
      this.callbacks?.onSpeechStart?.();
    }
  }

  sendAudio(data: ArrayBuffer | Uint8Array): void {
    if (!this.isConnected || !this.deepgramWs) return;
    try {
      if (this.deepgramWs.readyState === WebSocket.OPEN) {
        this.deepgramWs.send(data);
      }
    } catch (e) {
      console.error('[Transcription] Send audio error:', e);
    }
  }

  disconnect(): void {
    this.isConnected = false;
    if (this.deepgramWs) {
      try { this.deepgramWs.close(1000, 'disconnect'); } catch {}
      this.deepgramWs = null;
    }
    this.callbacks = null;
  }
}
