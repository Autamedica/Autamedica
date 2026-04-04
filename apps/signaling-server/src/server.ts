/**
 * WebRTC Signaling Server
 *
 * Servidor Socket.io para coordinar llamadas WebRTC entre pacientes y médicos
 *
 * Features:
 * - Room management con Supabase
 * - SDP offer/answer exchange
 * - ICE candidate exchange
 * - JWT authentication
 * - Connection monitoring
 * - Rate limiting
 */

// Load environment variables FIRST
import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { authenticateSocket } from './auth.js';
import { logger } from './logger.js';
import { SocketRateLimiter } from './rate-limiter.js';
import { RoomManager } from './rooms.js';
import type { ClientToServerEvents, ServerToClientEvents } from './types.js';
import {
  isValidRoomId,
  isValidUserId,
  isValidSDP,
  isValidIceCandidate,
  isValidConnectionStats,
} from './validation.js';
const PORT = parseInt(process.env.PORT || '8888', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3003';

// Express app
const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeRooms: roomManager.getActiveRoomsCount(),
    activeConnections: io.sockets.sockets.size,
  });
});

// HTTP server
const httpServer = createServer(app);

// Socket.io server
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 30000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

// Room manager & rate limiter
const roomManager = new RoomManager();
const rateLimiter = new SocketRateLimiter();

/**
 * Socket.io connection handler
 */
io.on('connection', async (socket: Socket) => {
  logger.info(`[Signaling] New connection: ${socket.id}`);

  const userId = socket.handshake.query.userId as string;
  const token = socket.handshake.query.token as string;

  if (!isValidUserId(userId)) {
    logger.warn(`[Signaling] Connection rejected: invalid userId`);
    socket.disconnect(true);
    return;
  }

  /** Validate + rate-limit guard reusable across handlers */
  function guardEvent(eventName: string, roomId: unknown): roomId is string {
    if (!rateLimiter.check(socket.id, eventName)) {
      logger.warn(`[Signaling] Rate limited: ${userId} on ${eventName}`);
      socket.emit('error', { message: 'Rate limit exceeded' });
      return false;
    }
    if (!isValidRoomId(roomId)) {
      logger.warn(`[Signaling] Invalid roomId from ${userId}: ${String(roomId).slice(0, 40)}`);
      socket.emit('error', { message: 'Invalid room ID' });
      return false;
    }
    return true;
  }

  // Authenticate
  const authResult = await authenticateSocket(userId, token);
  if (!authResult.authenticated) {
    logger.warn(`[Signaling] Authentication failed for user ${userId}`);
    socket.emit('error', { message: 'Authentication failed' });
    socket.disconnect(true);
    return;
  }

  logger.info(`[Signaling] User authenticated: ${userId}`);

  // Store user info in socket
  socket.data.userId = userId;
  socket.data.userRole = authResult.role;

  /**
   * JOIN ROOM
   */
  socket.on('join-room', async ({ roomId }) => {
    if (!guardEvent('join-room', roomId)) return;
    try {
      logger.info(`[Signaling] User ${userId} joining room ${roomId}`);

      await socket.join(roomId);

      const room = await roomManager.joinRoom(roomId, userId, socket.data.userRole);

      logger.info(`[Signaling] User ${userId} joined room ${roomId}. Total users: ${room.users.length}`);

      // Notify user they joined successfully
      socket.emit('room-joined', {
        roomId,
        users: room.users,
      });

      // Notify others in room
      socket.to(roomId).emit('user-joined', {
        roomId,
        userId,
        role: socket.data.userRole,
      });

      // If there are 2+ users, signal them to start negotiation
      if (room.users.length >= 2) {
        logger.info(`[Signaling] Room ${roomId} has 2+ users, triggering negotiation`);
      }
    } catch (error) {
      logger.error(`[Signaling] Error joining room:`, error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  /**
   * LEAVE ROOM
   */
  socket.on('leave-room', async ({ roomId }) => {
    if (!guardEvent('leave-room', roomId)) return;
    try {
      logger.info(`[Signaling] User ${userId} leaving room ${roomId}`);

      await socket.leave(roomId);
      await roomManager.leaveRoom(roomId, userId);

      socket.to(roomId).emit('user-left', {
        roomId,
        userId,
      });

      logger.info(`[Signaling] User ${userId} left room ${roomId}`);
    } catch (error) {
      logger.error(`[Signaling] Error leaving room:`, error);
    }
  });

  /**
   * SDP OFFER
   */
  socket.on('offer', ({ roomId, offer }) => {
    if (!guardEvent('offer', roomId)) return;
    if (!isValidSDP(offer)) {
      socket.emit('error', { message: 'Invalid SDP offer' });
      return;
    }
    socket.to(roomId).emit('offer', { roomId, userId, offer });
  });

  socket.on('answer', ({ roomId, answer }) => {
    if (!guardEvent('answer', roomId)) return;
    if (!isValidSDP(answer)) {
      socket.emit('error', { message: 'Invalid SDP answer' });
      return;
    }
    socket.to(roomId).emit('answer', { roomId, userId, answer });
  });

  socket.on('ice-candidate', ({ roomId, candidate }) => {
    if (!guardEvent('ice-candidate', roomId)) return;
    if (!isValidIceCandidate(candidate)) {
      socket.emit('error', { message: 'Invalid ICE candidate' });
      return;
    }
    socket.to(roomId).emit('ice-candidate', { roomId, userId, candidate });
  });

  socket.on('call-init', ({ roomId }) => {
    if (!guardEvent('call-init', roomId)) return;
    logger.info(`[Signaling] Call initiated by ${userId} in room ${roomId}`);
    socket.to(roomId).emit('call-init', { roomId, userId });
  });

  socket.on('call-end', ({ roomId }) => {
    if (!guardEvent('call-end', roomId)) return;
    logger.info(`[Signaling] Call ended by ${userId} in room ${roomId}`);
    socket.to(roomId).emit('call-end', { roomId, userId });
  });

  socket.on('connection-stats', ({ roomId, stats }) => {
    if (!guardEvent('connection-stats', roomId)) return;
    if (!isValidConnectionStats(stats)) {
      socket.emit('error', { message: 'Invalid connection stats' });
      return;
    }
    socket.to(roomId).emit('peer-stats', { roomId, userId, stats });
  });

  /**
   * DISCONNECT
   */
  socket.on('disconnect', async (reason) => {
    logger.info(`[Signaling] User ${userId} disconnected: ${reason}`);
    rateLimiter.removeSocket(socket.id);

    // Snapshot room IDs to avoid iterating a mutating Map
    const userRooms = await roomManager.getUserRooms(userId);

    for (const roomId of userRooms) {
      await roomManager.leaveRoom(roomId, userId);
      socket.to(roomId).emit('user-left', { roomId, userId });
    }
  });

  /**
   * ERROR HANDLER
   */
  socket.on('error', (error) => {
    logger.error(`[Signaling] Socket error for user ${userId}:`, error);
  });
});

/**
 * Start server
 */
httpServer.listen(PORT, () => {
  logger.info(`[Signaling] Server running on port ${PORT}`);
  logger.info(`[Signaling] CORS origin: ${CORS_ORIGIN}`);
  logger.info(`[Signaling] Health check: http://localhost:${PORT}/health`);
});

/**
 * Graceful shutdown
 */
function shutdown(signal: string) {
  logger.info(`[Signaling] ${signal} received, closing server...`);
  roomManager.destroy();
  httpServer.close(() => {
    logger.info('[Signaling] Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Export for testing
export { io, roomManager };
