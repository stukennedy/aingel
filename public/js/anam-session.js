/**
 * Anam voice session orchestrator.
 * Connects WebSocket to server, mic capture for ASR, and Anam avatar for TTS.
 * ES module — no bundler needed.
 */
import { AudioCapture } from './audio-capture.js';

let ws = null;
let audioCapture = null;
let anamClient = null;
let talkStream = null;
let isActive = false;

// DOM references (set during init)
let transcriptEl = null;
let statusEl = null;
let videoEl = null;

function log(msg) {
  console.log('[AnamSession]', msg);
  if (statusEl) statusEl.textContent = msg;
}

function updateTranscript(text, who = 'user') {
  if (!transcriptEl) return;
  const line = document.createElement('div');
  line.className = `transcript-${who}`;
  line.textContent = `${who === 'user' ? '🗣️' : '🤖'} ${text}`;
  transcriptEl.appendChild(line);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

async function initAnam() {
  // Try to load Anam SDK from CDN
  try {
    const resp = await fetch('/api/anam-token', { method: 'POST' });
    const { sessionToken, error } = await resp.json();
    if (error || !sessionToken) {
      log('Failed to get Anam token: ' + (error || 'no token'));
      return false;
    }

    // Dynamic import from CDN
    const AnamSDK = await import('https://cdn.jsdelivr.net/npm/@anam-ai/js-sdk@latest/dist/index.js').catch(() => null);
    if (AnamSDK && AnamSDK.createClient) {
      anamClient = AnamSDK.createClient(sessionToken, {
        personaId: 'default',
        disableInputAudio: true, // We handle STT ourselves
      });

      if (videoEl) {
        anamClient.streamToVideoElement(videoEl);
        videoEl.style.display = 'block';
      }

      log('Anam avatar initialized');
      return true;
    } else {
      log('Anam SDK not available — text-only mode');
      return true; // Continue without avatar
    }
  } catch (e) {
    console.warn('[AnamSession] Anam init failed, continuing without avatar:', e);
    return true; // Continue without avatar
  }
}

function connectWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/api/session/ws`);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    log('Connected to server');
    ws.send(JSON.stringify({ type: 'hello', mode: 'anam' }));
  };

  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) return; // We don't expect binary from server

    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch {}
  };

  ws.onclose = () => {
    log('Disconnected');
    stop();
  };

  ws.onerror = (e) => {
    console.error('[AnamSession] WebSocket error:', e);
    log('Connection error');
  };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'services_ready':
      log('Voice pipeline ready — speak now!');
      startAudioCapture(msg.sampleRate || 16000);
      break;

    case 'interim_transcript':
      // Update interim display
      if (statusEl) statusEl.textContent = `Hearing: ${msg.text}`;
      break;

    case 'user_turn':
      updateTranscript(msg.text, 'user');
      break;

    case 'start_of_turn':
      // User started speaking — interrupt avatar
      if (anamClient) {
        try { anamClient.interrupt(); } catch {}
      }
      if (talkStream) {
        try { talkStream.endMessage(); } catch {}
        talkStream = null;
      }
      break;

    case 'ai_turn_start':
      // LLM started generating
      if (anamClient) {
        try {
          talkStream = anamClient.createTalkMessageStream();
        } catch (e) {
          console.warn('[AnamSession] Could not create talk stream:', e);
        }
      }
      break;

    case 'text_delta':
      if (msg.text && talkStream) {
        try { talkStream.streamMessageChunk(msg.text); } catch {}
      }
      if (msg.isEnd && talkStream) {
        try { talkStream.endMessage(); } catch {}
        talkStream = null;
      }
      break;

    case 'ai_turn':
      if (msg.text) {
        updateTranscript(msg.text, 'ai');
      }
      break;

    case 'field_updated':
      // Update form field in the UI
      const input = document.querySelector(`input[name="${msg.field}"]`);
      if (input) {
        input.value = msg.value;
        // Flash save indicator
        const indicator = document.getElementById(`save-${msg.field}`);
        if (indicator) {
          indicator.textContent = '✓ saved';
          indicator.classList.add('visible');
          setTimeout(() => indicator.classList.remove('visible'), 2000);
        }
      }
      break;

    case 'onboarding_complete':
      log('✨ Onboarding complete!');
      break;

    case 'error':
      log('Error: ' + msg.message);
      break;
  }
}

function startAudioCapture(sampleRate) {
  if (audioCapture) return;
  audioCapture = new AudioCapture(ws, sampleRate);
  audioCapture.start().catch(e => {
    log('Mic access denied: ' + e.message);
  });
}

export async function start(elements = {}) {
  if (isActive) return;
  isActive = true;

  transcriptEl = elements.transcript || document.getElementById('voice-transcript');
  statusEl = elements.status || document.getElementById('voice-status');
  videoEl = elements.video || document.getElementById('anam-video');

  log('Starting voice session...');

  // Init Anam avatar (non-blocking — works in text-only mode too)
  await initAnam();

  // Connect WebSocket to server
  connectWebSocket();
}

export function stop() {
  isActive = false;
  if (audioCapture) { audioCapture.stop(); audioCapture = null; }
  if (ws) { try { ws.close(); } catch {} ws = null; }
  if (anamClient) {
    try { anamClient.disconnect(); } catch {}
    anamClient = null;
  }
  talkStream = null;
  if (videoEl) videoEl.style.display = 'none';
  log('Session ended');
}

export function isRunning() {
  return isActive;
}
