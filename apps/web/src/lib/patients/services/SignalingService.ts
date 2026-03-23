import { EventEmitter } from 'events';
import { logger } from '@autamedica/shared';

export enum SignalingEvent {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
  USER_JOINED = 'user-joined',
  USER_LEFT = 'user-left',
  OFFER_RECEIVED = 'offer-received',
  ANSWER_RECEIVED = 'answer-received',
  ICE_CANDIDATE_RECEIVED = 'ice-candidate-received',
  CALL_INITIATED = 'call-initiated',
  CALL_ENDED = 'call-ended',
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join-room' | 'leave-room' | 'call-init' | 'call-end';
  roomId: string;
  userId: string;
  data?: unknown;
}

export interface SignalingConfig {
  serverUrl: string;
  userId: string;
  authToken?: string;
  autoReconnect?: boolean;
  heartbeatInterval?: number;
}

export class SignalingService extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: Required<SignalingConfig>;
  private currentRoomId: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isConnected = false;

  constructor(config: SignalingConfig) {
    super();

    this.config = {
      serverUrl: config.serverUrl,
      userId: config.userId,
      authToken: config.authToken || '',
      autoReconnect: config.autoReconnect ?? true,
      heartbeatInterval: config.heartbeatInterval ?? 30000, // 30s
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${this.config.serverUrl}?userId=${this.config.userId}${
          this.config.authToken ? `&token=${this.config.authToken}` : ''
        }`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.isConnected = true;
          this.emit(SignalingEvent.CONNECTED);
          this.startHeartbeat();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          logger.error('[SignalingService] WebSocket error:', error);
          this.emit(SignalingEvent.ERROR, error);
          reject(error);
        };

        this.ws.onclose = (event) => {
          this.isConnected = false;
          this.stopHeartbeat();
          this.emit(SignalingEvent.DISCONNECTED);

          // Auto-reconnect si está habilitado
          if (this.config.autoReconnect && event.code !== 1000) {
            // logger.info('[SignalingService] Attempting reconnection in 5s...');
            this.reconnectTimer = setTimeout(() => {
              this.connect();
            }, 5000);
          }
        };
      } catch (error) {
        logger.error('[SignalingService] Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.isConnected = false;
    this.currentRoomId = null;
  }

  joinRoom(roomId: string): void {
    this.currentRoomId = roomId;

    const message: SignalingMessage = {
      type: 'join-room',
      roomId,
      userId: this.config.userId,
    };

    this.send(message);
  }

  leaveRoom(): void {
    if (!this.currentRoomId) {
      logger.warn('[SignalingService] Not in any room');
      return;
    }

    const message: SignalingMessage = {
      type: 'leave-room',
      roomId: this.currentRoomId,
      userId: this.config.userId,
    };

    this.send(message);
    this.currentRoomId = null;
  }

  sendOffer(roomId: string, offer: RTCSessionDescriptionInit): void {
    const message: SignalingMessage = {
      type: 'offer',
      roomId,
      userId: this.config.userId,
      data: offer,
    };

    this.send(message);
  }

  sendAnswer(roomId: string, answer: RTCSessionDescriptionInit): void {
    const message: SignalingMessage = {
      type: 'answer',
      roomId,
      userId: this.config.userId,
      data: answer,
    };

    this.send(message);
  }

  sendIceCandidate(roomId: string, candidate: RTCIceCandidate): void {
    const message: SignalingMessage = {
      type: 'ice-candidate',
      roomId,
      userId: this.config.userId,
      data: {
        candidate: candidate.candidate,
        sdpMLineIndex: candidate.sdpMLineIndex,
        sdpMid: candidate.sdpMid,
      },
    };

    this.send(message);
  }

  private send(message: SignalingMessage): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      logger.error('[SignalingService] Cannot send message: WebSocket not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error('[SignalingService] Failed to send message:', error);
    }
  }

  private handleMessage(data: string): void {
    try {
      const message: SignalingMessage = JSON.parse(data);

      switch (message.type) {
        case 'offer':
          this.emit(SignalingEvent.OFFER_RECEIVED, {
            roomId: message.roomId,
            userId: message.userId,
            offer: message.data,
          });
          break;

        case 'answer':
          this.emit(SignalingEvent.ANSWER_RECEIVED, {
            roomId: message.roomId,
            userId: message.userId,
            answer: message.data,
          });
          break;

        case 'ice-candidate':
          this.emit(SignalingEvent.ICE_CANDIDATE_RECEIVED, {
            roomId: message.roomId,
            userId: message.userId,
            candidate: message.data,
          });
          break;

        case 'call-init':
          this.emit(SignalingEvent.CALL_INITIATED, {
            roomId: message.roomId,
            userId: message.userId,
          });
          break;

        case 'call-end':
          this.emit(SignalingEvent.CALL_ENDED, {
            roomId: message.roomId,
            userId: message.userId,
          });
          break;

        default:
          logger.warn('[SignalingService] Unknown message type:', message.type);
      }
    } catch (error) {
      logger.error('[SignalingService] Failed to parse message:', error);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  get connected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  get roomId(): string | null {
    return this.currentRoomId;
  }
}

let signalingInstance: SignalingService | null = null;

export function getSignalingService(config?: SignalingConfig): SignalingService {
  if (!signalingInstance && config) {
    signalingInstance = new SignalingService(config);
  }

  if (!signalingInstance) {
    throw new Error('SignalingService not initialized. Provide config on first call.');
  }

  return signalingInstance;
}

export function resetSignalingService(): void {
  if (signalingInstance) {
    signalingInstance.disconnect();
    signalingInstance = null;
  }
}
