/**
 * Onboarding page client-side logic
 * Handles Anam voice session for carer-assisted form filling
 */

import { AnamSession } from './anam-session';

let session: AnamSession | null = null;
let startBtn: HTMLButtonElement | null;
let stopBtn: HTMLButtonElement | null;
let statusEl: HTMLElement | null;
let transcriptEl: HTMLElement | null;
let videoEl: HTMLVideoElement | null;

function updateFormField(field: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(
    `#onboarding-form input[name="${field}"]`,
  );
  if (!input) return;

  input.value = value;

  // Show save indicator
  const indicator = document.getElementById(`save-${field}`);
  if (indicator) {
    indicator.className = 'save-indicator visible';
    indicator.textContent = '✓ saved';
    setTimeout(() => {
      indicator.className = 'save-indicator';
    }, 2000);
  }
}

function appendTranscript(role: 'user' | 'agent', text: string) {
  if (!transcriptEl) return;
  transcriptEl.style.display = 'block';

  const line = document.createElement('p');
  line.style.margin = '0.25rem 0';
  if (role === 'user') {
    line.innerHTML = `<strong>You:</strong> ${text}`;
  } else {
    line.innerHTML = `<strong>Aíngel:</strong> ${text}`;
  }
  transcriptEl.appendChild(line);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

async function startVoice() {
  if (!startBtn || !stopBtn) return;

  startBtn.style.display = 'none';
  stopBtn.style.display = 'inline-flex';
  if (videoEl) videoEl.style.display = 'block';
  if (statusEl) statusEl.textContent = 'Connecting...';

  try {
    session = new AnamSession({
      onStatusChange(status) {
        if (statusEl) {
          const labels: Record<string, string> = {
            connecting: 'Connecting...',
            connected: 'Voice session active — speak naturally',
            disconnected: 'Session ended',
            error: 'Connection error',
          };
          statusEl.textContent = labels[status] || status;
        }
      },
      onUserTranscript(text) {
        appendTranscript('user', text);
      },
      onAgentText(text) {
        // Update the last agent line or add new one
        const agentLines = transcriptEl?.querySelectorAll('p:last-child strong');
        const lastStrong = agentLines?.[agentLines.length - 1];
        if (lastStrong?.textContent === 'Aíngel:') {
          lastStrong.parentElement!.innerHTML = `<strong>Aíngel:</strong> ${text}`;
        } else {
          appendTranscript('agent', text);
        }
      },
      onFieldUpdated(field, value) {
        updateFormField(field, value);
      },
      onComplete() {
        if (statusEl) statusEl.textContent = 'Onboarding complete!';
        stopVoice();
      },
      onError(error) {
        console.error('[Onboarding] Error:', error);
        if (statusEl) statusEl.textContent = 'Error: ' + error.message;
      },
    });

    await session.connect('anam-video');
  } catch (err) {
    console.error('[Onboarding] Failed to start:', err);
    if (statusEl) statusEl.textContent = 'Failed to connect';
    stopVoice();
  }
}

function stopVoice() {
  if (session) {
    session.disconnect();
    session = null;
  }
  if (startBtn) startBtn.style.display = 'inline-flex';
  if (stopBtn) stopBtn.style.display = 'none';
  if (videoEl) videoEl.style.display = 'none';
}

function init() {
  startBtn = document.getElementById('voice-start-btn') as HTMLButtonElement;
  stopBtn = document.getElementById('voice-stop-btn') as HTMLButtonElement;
  statusEl = document.getElementById('voice-status');
  transcriptEl = document.getElementById('voice-transcript');
  videoEl = document.getElementById('anam-video') as HTMLVideoElement;

  if (startBtn) startBtn.addEventListener('click', startVoice);
  if (stopBtn) stopBtn.addEventListener('click', stopVoice);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
