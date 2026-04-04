/**
 * Room Manager para gestión de salas de videoconsulta
 * 
 * Gestiona:
 * - Creación y limpieza de salas
 * - Join/leave de usuarios
 * - Validación de permisos
 * - Tracking en Supabase (opcional)
 */

import type { Database } from '@autamedica/types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger.js';
import type { Room, RoomUser } from './types.js';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private supabase: SupabaseClient<Database> | null = null;
  private cleanupIntervalId: ReturnType<typeof setInterval>;
  private roomLocks = new Map<string, Promise<void>>();

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      this.supabase = createClient<Database>(supabaseUrl, supabaseKey);
      logger.info('[RoomManager] Supabase integration enabled');
    } else {
      logger.warn('[RoomManager] Supabase not configured, running in-memory only');
    }

    this.cleanupIntervalId = setInterval(() => this.cleanupInactiveRooms(), 5 * 60 * 1000);
  }

  /**
   * Promise-chain mutex per room. Serializes concurrent join/leave on same room.
   */
  private async withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.roomLocks.get(roomId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const next = new Promise<void>(r => { release = r; });
    this.roomLocks.set(roomId, next);

    try {
      await prev;
      return await fn();
    } finally {
      if (release) release();
      if (this.roomLocks.get(roomId) === next) {
        this.roomLocks.delete(roomId);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupIntervalId);
    this.rooms.clear();
    this.roomLocks.clear();
  }

  /**
   * Join room
   */
  async joinRoom(roomId: string, userId: string, role: 'patient' | 'doctor'): Promise<Room> {
    return this.withRoomLock(roomId, async () => {
      let room = this.rooms.get(roomId);

      if (!room) {
        room = {
          id: roomId,
          users: [],
          createdAt: new Date(),
          lastActivity: new Date(),
        };
        this.rooms.set(roomId, room);
        logger.info(`[RoomManager] Created new room: ${roomId}`);
      }

      const existingUser = room.users.find(u => u.userId === userId);
      if (existingUser) {
        logger.warn(`[RoomManager] User ${userId} already in room ${roomId}`);
        return room;
      }

      if (room.users.length >= 2) {
        logger.error(`[RoomManager] Room ${roomId} is full`);
        throw new Error('Room is full');
      }

      const roomUser: RoomUser = {
        userId,
        role,
        joinedAt: new Date(),
      };

      room.users.push(roomUser);
      room.lastActivity = new Date();

      logger.info(`[RoomManager] User ${userId} (${role}) joined room ${roomId}`);

      if (this.supabase) {
        try {
          await this.supabase.from('telemedicine_room_participants').insert({
            room_id: roomId,
            user_id: userId,
            role,
            joined_at: roomUser.joinedAt.toISOString(),
          });
        } catch (error) {
          logger.error('[RoomManager] Failed to log to Supabase:', error);
        }
      }

      return room;
    });
  }

  /**
   * Leave room
   */
  async leaveRoom(roomId: string, userId: string): Promise<void> {
    return this.withRoomLock(roomId, async () => {
      const room = this.rooms.get(roomId);
      if (!room) {
        logger.warn(`[RoomManager] Room ${roomId} not found`);
        return;
      }

      room.users = room.users.filter(u => u.userId !== userId);
      room.lastActivity = new Date();

      logger.info(`[RoomManager] User ${userId} left room ${roomId}. Remaining users: ${room.users.length}`);

      if (room.users.length === 0) {
        this.rooms.delete(roomId);
        logger.info(`[RoomManager] Deleted empty room: ${roomId}`);
      }

      if (this.supabase) {
        try {
          await this.supabase
            .from('telemedicine_room_participants')
            .update({ left_at: new Date().toISOString() })
            .eq('room_id', roomId)
            .eq('user_id', userId)
            .is('left_at', null);
        } catch (error) {
          logger.error('[RoomManager] Failed to log to Supabase:', error);
        }
      }
    });
  }

  /**
   * Get room
   */
  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get all rooms for a user
   */
  async getUserRooms(userId: string): Promise<string[]> {
    const userRooms: string[] = [];

    for (const [roomId, room] of this.rooms.entries()) {
      if (room.users.some(u => u.userId === userId)) {
        userRooms.push(roomId);
      }
    }

    return userRooms;
  }

  /**
   * Get active rooms count
   */
  getActiveRoomsCount(): number {
    return this.rooms.size;
  }

  /**
   * Cleanup inactive rooms (sin actividad en más de 1 hora)
   */
  private cleanupInactiveRooms(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [roomId, room] of this.rooms.entries()) {
      if (room.lastActivity < oneHourAgo) {
        this.rooms.delete(roomId);
        cleanedCount++;
        logger.info(`[RoomManager] Cleaned up inactive room: ${roomId}`);
      }
    }

    if (cleanedCount > 0) {
      logger.info(`[RoomManager] Cleanup complete. Removed ${cleanedCount} inactive rooms`);
    }
  }

  /**
   * Validate room access (para verificar permisos)
   */
  async validateRoomAccess(roomId: string, userId: string): Promise<boolean> {
    // Validate user belongs to the telemedicine session

    if (!this.supabase) {
      return true; // Permitir sin validación si no hay Supabase
    }

    try {
      const { data, error } = await this.supabase
        .from('telemedicine_sessions')
        .select('*')
        .eq('id', roomId)
        .or(`patient_id.eq.${userId},doctor_id.eq.${userId}`)
        .single();

      if (error || !data) {
        logger.warn(`[RoomManager] Access denied for user ${userId} to room ${roomId}`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('[RoomManager] Error validating room access:', error);
      return false; // Denegar por defecto en caso de error
    }
  }
}
