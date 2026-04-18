import type { ClientMessage, ServerMessage, UserMeta } from './types'

const MAX_USERS = 2

/**
 * Durable Object that manages WebSocket connections for a single signaling room.
 * Uses the Hibernation API so idle rooms don't consume resources.
 *
 * State management:
 * - Each WebSocket gets a unique connId tag at accept time
 * - User metadata (userId, userType) is stored in DO storage keyed by connId
 * - On hibernation wake, metadata is loaded from storage via connId tags
 */
export class SignalingRoom implements DurableObject {
  private state: DurableObjectState
  // In-memory cache: connId -> UserMeta (rebuilt from storage on wake)
  private userCache = new Map<string, UserMeta>()

   
  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade')
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    const existingWebSockets = this.state.getWebSockets()
    if (existingWebSockets.length >= MAX_USERS) {
      return new Response(
        JSON.stringify({ type: 'error', data: 'Room is full (max 2 users)' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    // Accept with a unique connId tag (userId not known yet, comes in 'join' message)
    const connId = crypto.randomUUID()
    this.state.acceptWebSocket(server, [connId])

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return

    let parsed: ClientMessage
    try {
      parsed = JSON.parse(message)
    } catch {
      this.sendTo(ws, { type: 'error', data: 'Invalid JSON' })
      return
    }

    switch (parsed.type) {
      case 'join':
        await this.handleJoin(ws, parsed.from, parsed.data.userType)
        break

      case 'leave':
        await this.handleLeave(ws)
        break

      case 'offer':
      case 'answer':
      case 'ice-candidate':
      case 'cf-session':
      case 'chat':
      case 'clinical-mode':
        await this.handleRelay(ws, parsed)
        break

      default:
        this.sendTo(ws, { type: 'error', data: 'Unknown message type' })
    }
  }

   
  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    await this.handleLeave(ws)
  }

   
  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    await this.handleLeave(ws)
  }

  // --- Private Handlers ---

  private async handleJoin(ws: WebSocket, userId: string, userType: string): Promise<void> {
    const connId = this.getConnId(ws)
    if (!connId) {
      this.sendTo(ws, { type: 'error', data: 'Connection not recognized' })
      return
    }

    // Close any existing connection from the same userId (reconnection)
    for (const existingWs of this.state.getWebSockets()) {
      if (existingWs === ws) continue
      const existingMeta = await this.getUserMeta(existingWs)
      if (existingMeta?.userId === userId) {
        const oldConnId = this.getConnId(existingWs)
        if (oldConnId) {
          this.userCache.delete(oldConnId)
          await this.state.storage.delete('conn:' + oldConnId)
        }
        try { existingWs.close(1000, 'Replaced by new connection') } catch { /* ignore */ }
      }
    }

    // Store user metadata (survives hibernation)
    const meta: UserMeta = { userId, userType }
    this.userCache.set(connId, meta)
    await this.state.storage.put('conn:' + connId, meta)

    // Build list of existing users for room-state (excluding the joining user)
    const existingUsers: Array<{ id: string; userType: string }> = []
    for (const otherWs of this.state.getWebSockets()) {
      if (otherWs === ws) continue
      const otherMeta = await this.getUserMeta(otherWs)
      if (otherMeta) {
        existingUsers.push({ id: otherMeta.userId, userType: otherMeta.userType })
      }
    }

    // Send room-state to the joining user
    this.sendTo(ws, { type: 'room-state', data: { users: existingUsers } })

    // Replay any cf-session announcements from existing users so the late joiner
    // can subscribe to their SFU tracks. Without this, a peer that announced its
    // cf-session to an empty room never gets that announcement re-delivered when
    // someone new arrives.
    for (const otherWs of this.state.getWebSockets()) {
      if (otherWs === ws) continue
      const otherMeta = await this.getUserMeta(otherWs)
      if (otherMeta?.cfSessionId) {
        this.sendTo(ws, {
          type: 'cf-session',
          from: otherMeta.userId,
          data: { sessionId: otherMeta.cfSessionId, userType: otherMeta.userType },
        })
      }
    }

    // Broadcast user-joined to everyone else
    this.broadcast({ type: 'user-joined', from: userId, data: { userType } }, ws)
  }

  private async handleLeave(ws: WebSocket): Promise<void> {
    const meta = await this.getUserMeta(ws)
    const connId = this.getConnId(ws)

    if (connId) {
      this.userCache.delete(connId)
      await this.state.storage.delete('conn:' + connId)
    }

    if (meta) {
      this.broadcast({ type: 'user-left', from: meta.userId }, ws)
    }

    try { ws.close(1000, 'Left room') } catch { /* already closed */ }
  }

  private async handleRelay(
    ws: WebSocket,
    message: any
  ): Promise<void> {
    const senderMeta = await this.getUserMeta(ws)
    if (!senderMeta) {
      this.sendTo(ws, { type: 'error', data: 'Must join before sending signals' })
      return
    }

    if (message.type === 'cf-session' || message.type === 'chat' || message.type === 'clinical-mode') {
      // Persist the sender's cfSessionId so future joiners can be told about it
      // via the replay path in handleJoin.
      if (message.type === 'cf-session') {
        const sessionId = (message.data as { sessionId?: string })?.sessionId
        if (sessionId) {
          const connId = this.getConnId(ws)
          if (connId) {
            const updated: UserMeta = { ...senderMeta, cfSessionId: sessionId }
            this.userCache.set(connId, updated)
            await this.state.storage.put('conn:' + connId, updated)
          }
        }
      }

      this.broadcast({
        type: message.type,
        from: senderMeta.userId,
        data: message.data,
      } as ServerMessage, ws)
      return
    }

    // Find target WebSocket by userId
    for (const targetWs of this.state.getWebSockets()) {
      const targetMeta = await this.getUserMeta(targetWs)
      if (targetMeta?.userId === message.to) {
        this.sendTo(targetWs, {
          type: message.type,
          from: senderMeta.userId,
          data: message.data,
        } as ServerMessage)
        return
      }
    }
    // Target not found: normal during ICE trickle, client handles timeout
  }

  // --- Utilities ---

  private getConnId(ws: WebSocket): string | null {
    const tags = this.state.getTags(ws)
    return tags[0] || null
  }

  private async getUserMeta(ws: WebSocket): Promise<UserMeta | null> {
    const connId = this.getConnId(ws)
    if (!connId) return null

    // Check in-memory cache first
    const cached = this.userCache.get(connId)
    if (cached) return cached

    // Load from storage (needed after hibernation wake)
    const stored = await this.state.storage.get<UserMeta>('conn:' + connId)
    if (stored) {
      this.userCache.set(connId, stored)
    }
    return stored || null
  }

  private sendTo(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message))
    } catch { /* WebSocket may be closed */ }
  }

  private broadcast(message: ServerMessage, exclude?: WebSocket): void {
    const raw = JSON.stringify(message)
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue
      try { ws.send(raw) } catch { /* skip dead sockets */ }
    }
  }
}
