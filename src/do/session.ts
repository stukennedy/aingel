// SessionDO — Durable Object for per-user voice session orchestration
// Phase 2+ will add: ASR pipeline, turn manager, LLM router, form state
export class SessionDO implements DurableObject {
  state: DurableObjectState

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      this.state.acceptWebSocket(pair[1])
      return new Response(null, { status: 101, webSocket: pair[0] })
    }

    return new Response(JSON.stringify({ status: 'ok', path: url.pathname }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Phase 3: handle audio frames + control messages
    if (typeof message === 'string') {
      const data = JSON.parse(message)
      ws.send(JSON.stringify({ type: 'ack', received: data.type }))
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // Cleanup
  }
}
