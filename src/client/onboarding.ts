/**
 * Onboarding page client-side logic
 * Uses HTMX 4 hx-ws for WebSocket connection (DOM updates handled by HTMX)
 * Hooks into the WS for: binary audio sending + Anam TTS via voice channel messages
 */

import { AnamSession } from './anam-session';

let session: AnamSession | null = null;
let ws: WebSocket | null = null;
let startBtn: HTMLButtonElement | null;
let stopBtn: HTMLButtonElement | null;
let videoEl: HTMLVideoElement | null;
let placeholder: HTMLElement | null;

function init() {
  startBtn = document.getElementById('voice-start-btn') as HTMLButtonElement;
  stopBtn = document.getElementById('voice-stop-btn') as HTMLButtonElement;
  videoEl = document.getElementById('anam-video') as HTMLVideoElement;
  placeholder = document.getElementById('avatar-placeholder');

  if (startBtn) startBtn.addEventListener('click', startVoice);
  if (stopBtn) stopBtn.addEventListener('click', stopVoice);

  // Grab the raw WebSocket from HTMX's hx-ws extension
  document.body.addEventListener('htmx:after:ws:connect', ((e: CustomEvent) => {
    ws = e.detail?.socket ?? null;
    console.log('[Onboarding] Got WebSocket from hx-ws');
  }) as EventListener);

  // Listen for voice channel messages from the server
  document.body.addEventListener('htmx:wsMessage', ((e: CustomEvent) => {
    const { channel, payload } = e.detail ?? {};
    if (channel === 'voice' && payload) {
      handleVoiceMessage(payload);
    }
  }) as EventListener);
}

function handleVoiceMessage(msg: any) {
  switch (msg.type) {
    case 'services_ready':
      console.log('[Onboarding] Services ready, sampleRate:', msg.sampleRate);
      if (session) {
        session.onServicesReady(ws!, msg.sampleRate || 16000);
      }
      break;

    case 'text_delta':
      if (session) {
        session.handleTextDelta(msg.text || '', msg.isEnd || false);
      }
      break;

    case 'ai_turn_start':
      // Agent starting a new response — nothing extra needed
      break;

    case 'onboarding_complete':
      // Don't stop yet — let the agent say goodbye and wait for user's farewell
      console.log('[Onboarding] Onboarding complete, awaiting goodbye');
      break;

    case 'session_ended':
      stopVoice();
      break;
  }
}

async function startVoice() {
  if (!startBtn || !stopBtn || !ws) return;

  startBtn.style.display = 'none';
  stopBtn.style.display = 'inline-flex';
  if (videoEl) videoEl.style.display = 'block';
  if (placeholder) placeholder.style.display = 'none';

  try {
    session = new AnamSession({
      onStatusChange(status) {
        console.log('[Onboarding] Anam status:', status);
        if (status === 'error') {
          stopVoice();
        }
      },
      onError(error) {
        console.error('[Onboarding] Anam error:', error);
      },
    });

    // Connect Anam avatar (for video rendering + TTS output)
    await session.connect('anam-video');

    // Tell the server to init the voice pipeline, seeding with pre-filled form values
    const fields = ['fullName', 'email', 'phone', 'age', 'physical', 'mental'] as const;
    const prefill: Record<string, string> = {};
    for (const f of fields) {
      const el = document.getElementById(`field-${f}`) as HTMLInputElement | null;
      if (el?.value) prefill[f] = el.value;
    }
    ws.send(JSON.stringify({ type: 'hello', mode: 'anam', prefill }));
  } catch (err) {
    console.error('[Onboarding] Failed to start:', err);
    stopVoice();
  }
}

function stopVoice() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'stop_voice' }));
  }

  if (session) {
    session.disconnect();
    session = null;
  }

  if (startBtn) startBtn.style.display = 'inline-flex';
  if (stopBtn) stopBtn.style.display = 'none';
  if (videoEl) videoEl.style.display = 'none';
  if (placeholder) placeholder.style.display = 'flex';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
