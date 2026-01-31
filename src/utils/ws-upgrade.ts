export type WSUpgradeOptions = {
  protocols?: string[];
  headers?: Record<string, string>;
  binaryType?: 'arraybuffer' | 'blob';
};

// Cloudflare Workers-compatible outbound WebSocket via fetch + Upgrade
export async function connectWebSocketUpgrade(url: string, options: WSUpgradeOptions = {}): Promise<WebSocket> {
  const requestUrl = url.startsWith('wss://') ? url.replace('wss://', 'https://') : url.startsWith('ws://') ? url.replace('ws://', 'http://') : url;

  const headers: Record<string, string> = {
    Upgrade: 'websocket',
    ...(options.headers || {})
  };
  if (options.protocols && options.protocols.length > 0) {
    headers['Sec-WebSocket-Protocol'] = options.protocols.join(', ');
  }

  const res = await fetch(requestUrl, { headers });
  if (res.status !== 101) {
    const body = await res.text().catch(() => '');
    throw new Error(`WebSocket upgrade failed (${res.status}): ${body || res.statusText}`);
  }

  const ws = (res as any).webSocket as WebSocket | undefined;
  if (!ws) throw new Error('webSocket not available on Response');
  (ws as any).accept?.();
  try {
    (ws as any).binaryType = options.binaryType || 'arraybuffer';
  } catch {}
  return ws;
}
