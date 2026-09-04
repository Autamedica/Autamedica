import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomManager } from '../rooms.js';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

describe('RoomManager', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('room creation via joinRoom', () => {
    it('creates a room when the first user joins', async () => {
      const room = await manager.joinRoom('room-1', 'user-a', 'patient');

      expect(room.id).toBe('room-1');
      expect(room.users).toHaveLength(1);
      expect(room.users[0]?.userId).toBe('user-a');
      expect(room.users[0]?.role).toBe('patient');
    });

    it('returns the same room when a second user joins', async () => {
      await manager.joinRoom('room-1', 'user-a', 'patient');
      const room = await manager.joinRoom('room-1', 'user-b', 'doctor');

      expect(room.id).toBe('room-1');
      expect(room.users).toHaveLength(2);
    });

    it('tracks creation and activity timestamps', async () => {
      const room = await manager.joinRoom('room-1', 'user-a', 'patient');

      expect(room.createdAt).toBeInstanceOf(Date);
      expect(room.lastActivity).toBeInstanceOf(Date);
      expect(room.lastActivity.getTime()).toBeGreaterThanOrEqual(room.createdAt.getTime());
    });
  });

  describe('joinRoom constraints', () => {
    it('throws when a third user tries to join a full room', async () => {
      await manager.joinRoom('room-1', 'user-a', 'patient');
      await manager.joinRoom('room-1', 'user-b', 'doctor');

      await expect(
        manager.joinRoom('room-1', 'user-c', 'patient'),
      ).rejects.toThrow('Room is full');
    });

    it('is idempotent: same user joining twice returns the room unchanged', async () => {
      await manager.joinRoom('room-1', 'user-a', 'patient');
      const room = await manager.joinRoom('room-1', 'user-a', 'patient');

      expect(room.users).toHaveLength(1);
    });
  });

  describe('leaveRoom', () => {
    it('removes the user from the room', async () => {
      await manager.joinRoom('room-1', 'user-a', 'patient');
      await manager.joinRoom('room-1', 'user-b', 'doctor');
      await manager.leaveRoom('room-1', 'user-a');

      const room = manager.getRoom('room-1');
      expect(room).toBeDefined();
      expect(room?.users).toHaveLength(1);
      expect(room?.users[0]?.userId).toBe('user-b');
    });

    it('destroys the room when the last user leaves', async () => {
      await manager.joinRoom('room-1', 'user-a', 'patient');
      await manager.leaveRoom('room-1', 'user-a');

      expect(manager.getRoom('room-1')).toBeUndefined();
    });

    it('silently handles leaving a nonexistent room', async () => {
      await expect(
        manager.leaveRoom('nonexistent', 'user-a'),
      ).resolves.toBeUndefined();
    });
  });

  describe('getRoom', () => {
    it('returns the room when it exists', async () => {
      await manager.joinRoom('room-1', 'user-a', 'patient');
      expect(manager.getRoom('room-1')).toBeDefined();
    });

    it('returns undefined for nonexistent rooms', () => {
      expect(manager.getRoom('does-not-exist')).toBeUndefined();
    });
  });

  describe('getUserRooms', () => {
    it('returns all rooms a user belongs to', async () => {
      await manager.joinRoom('room-1', 'user-a', 'patient');
      await manager.joinRoom('room-2', 'user-a', 'patient');

      const rooms = await manager.getUserRooms('user-a');
      expect(rooms).toEqual(expect.arrayContaining(['room-1', 'room-2']));
      expect(rooms).toHaveLength(2);
    });

    it('returns empty array for unknown user', async () => {
      const rooms = await manager.getUserRooms('unknown');
      expect(rooms).toEqual([]);
    });
  });

  describe('getActiveRoomsCount', () => {
    it('starts at zero', () => {
      expect(manager.getActiveRoomsCount()).toBe(0);
    });

    it('reflects the number of active rooms', async () => {
      await manager.joinRoom('room-1', 'user-a', 'patient');
      await manager.joinRoom('room-2', 'user-b', 'doctor');

      expect(manager.getActiveRoomsCount()).toBe(2);
    });

    it('decrements when rooms are destroyed', async () => {
      await manager.joinRoom('room-1', 'user-a', 'patient');
      await manager.leaveRoom('room-1', 'user-a');

      expect(manager.getActiveRoomsCount()).toBe(0);
    });
  });

  describe('destroy', () => {
    it('clears all rooms and stops cleanup interval', async () => {
      await manager.joinRoom('room-1', 'user-a', 'patient');
      await manager.joinRoom('room-2', 'user-b', 'doctor');

      manager.destroy();

      expect(manager.getActiveRoomsCount()).toBe(0);
      expect(manager.getRoom('room-1')).toBeUndefined();
    });
  });

  describe('validateRoomAccess (without Supabase)', () => {
    it('allows access when Supabase is not configured', async () => {
      const allowed = await manager.validateRoomAccess('room-1', 'user-a');
      expect(allowed).toBe(true);
    });
  });

  describe('concurrency (room lock)', () => {
    it('serializes concurrent joins to the same room', async () => {
      const results = await Promise.all([
        manager.joinRoom('room-1', 'user-a', 'patient'),
        manager.joinRoom('room-1', 'user-b', 'doctor'),
      ]);

      const room = manager.getRoom('room-1');
      expect(room).toBeDefined();
      expect(room?.users).toHaveLength(2);

      const userIds = room?.users.map((u) => u.userId).sort();
      expect(userIds).toEqual(['user-a', 'user-b']);

      expect(results[0].id).toBe('room-1');
      expect(results[1].id).toBe('room-1');
    });
  });
});
