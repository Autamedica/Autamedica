import { describe, expect, it } from 'vitest';
import {
  isValidRoomId,
  isValidUserId,
  isValidSDP,
  isValidIceCandidate,
  isValidConnectionStats,
} from '../validation.js';

describe('isValidRoomId', () => {
  it('accepts alphanumeric room IDs', () => {
    expect(isValidRoomId('room-123')).toBe(true);
    expect(isValidRoomId('abc_def')).toBe(true);
    expect(isValidRoomId('a')).toBe(true);
  });

  it('accepts room IDs up to 128 characters', () => {
    expect(isValidRoomId('a'.repeat(128))).toBe(true);
  });

  it('rejects IDs longer than 128 characters', () => {
    expect(isValidRoomId('a'.repeat(129))).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidRoomId('')).toBe(false);
  });

  it('rejects non-string types', () => {
    expect(isValidRoomId(null)).toBe(false);
    expect(isValidRoomId(undefined)).toBe(false);
    expect(isValidRoomId(123)).toBe(false);
    expect(isValidRoomId({})).toBe(false);
  });

  it('rejects strings with special characters', () => {
    expect(isValidRoomId('room/123')).toBe(false);
    expect(isValidRoomId('room 123')).toBe(false);
    expect(isValidRoomId('room@123')).toBe(false);
    expect(isValidRoomId('../etc/passwd')).toBe(false);
  });
});

describe('isValidUserId', () => {
  it('accepts valid UUIDs', () => {
    expect(isValidUserId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUserId('6BA7B810-9DAD-11D1-80B4-00C04FD430C8')).toBe(true);
  });

  it('rejects invalid UUID formats', () => {
    expect(isValidUserId('not-a-uuid')).toBe(false);
    expect(isValidUserId('550e8400')).toBe(false);
    expect(isValidUserId('')).toBe(false);
  });

  it('rejects non-string types', () => {
    expect(isValidUserId(null)).toBe(false);
    expect(isValidUserId(undefined)).toBe(false);
    expect(isValidUserId(42)).toBe(false);
  });
});

describe('isValidSDP', () => {
  it('accepts a valid offer SDP', () => {
    expect(isValidSDP({ type: 'offer', sdp: 'v=0\r\no=- ...' })).toBe(true);
  });

  it('accepts a valid answer SDP', () => {
    expect(isValidSDP({ type: 'answer', sdp: 'v=0\r\no=- ...' })).toBe(true);
  });

  it('accepts pranswer and rollback types', () => {
    expect(isValidSDP({ type: 'pranswer' })).toBe(true);
    expect(isValidSDP({ type: 'rollback' })).toBe(true);
  });

  it('accepts SDP without sdp field (type-only)', () => {
    expect(isValidSDP({ type: 'offer' })).toBe(true);
  });

  it('rejects unknown SDP type', () => {
    expect(isValidSDP({ type: 'invalid' })).toBe(false);
  });

  it('rejects when sdp is not a string', () => {
    expect(isValidSDP({ type: 'offer', sdp: 123 })).toBe(false);
  });

  it('rejects null and primitives', () => {
    expect(isValidSDP(null)).toBe(false);
    expect(isValidSDP(undefined)).toBe(false);
    expect(isValidSDP('offer')).toBe(false);
    expect(isValidSDP(42)).toBe(false);
  });

  it('rejects object without type', () => {
    expect(isValidSDP({ sdp: 'v=0' })).toBe(false);
    expect(isValidSDP({})).toBe(false);
  });
});

describe('isValidIceCandidate', () => {
  it('accepts a full ICE candidate', () => {
    expect(
      isValidIceCandidate({
        candidate: 'candidate:842163049 1 udp 1677729535 ...',
        sdpMLineIndex: 0,
        sdpMid: 'audio',
      }),
    ).toBe(true);
  });

  it('accepts an empty ICE candidate (end-of-candidates)', () => {
    expect(isValidIceCandidate({})).toBe(true);
  });

  it('accepts candidate with null optional fields', () => {
    expect(
      isValidIceCandidate({
        candidate: 'candidate:...',
        sdpMLineIndex: null,
        sdpMid: null,
      }),
    ).toBe(true);
  });

  it('rejects when candidate is not a string', () => {
    expect(isValidIceCandidate({ candidate: 123 })).toBe(false);
  });

  it('rejects when sdpMLineIndex is not a number or null', () => {
    expect(isValidIceCandidate({ sdpMLineIndex: 'zero' })).toBe(false);
  });

  it('rejects when sdpMid is not a string or null', () => {
    expect(isValidIceCandidate({ sdpMid: 42 })).toBe(false);
  });

  it('rejects null and primitives', () => {
    expect(isValidIceCandidate(null)).toBe(false);
    expect(isValidIceCandidate(undefined)).toBe(false);
    expect(isValidIceCandidate('candidate')).toBe(false);
  });
});

describe('isValidConnectionStats', () => {
  it('accepts valid stats with all required fields', () => {
    expect(
      isValidConnectionStats({
        bitrate: 2500,
        latency: 45,
        packetLoss: 0.01,
        quality: 'excellent',
      }),
    ).toBe(true);
  });

  it('accepts all quality levels', () => {
    for (const quality of ['excellent', 'good', 'fair', 'poor']) {
      expect(
        isValidConnectionStats({
          bitrate: 1000,
          latency: 50,
          packetLoss: 0,
          quality,
        }),
      ).toBe(true);
    }
  });

  it('rejects unknown quality level', () => {
    expect(
      isValidConnectionStats({
        bitrate: 1000,
        latency: 50,
        packetLoss: 0,
        quality: 'terrible',
      }),
    ).toBe(false);
  });

  it('rejects when numeric fields are wrong type', () => {
    expect(
      isValidConnectionStats({
        bitrate: '1000',
        latency: 50,
        packetLoss: 0,
        quality: 'good',
      }),
    ).toBe(false);

    expect(
      isValidConnectionStats({
        bitrate: 1000,
        latency: '50',
        packetLoss: 0,
        quality: 'good',
      }),
    ).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(isValidConnectionStats({ bitrate: 1000 })).toBe(false);
    expect(isValidConnectionStats({})).toBe(false);
  });

  it('rejects null and primitives', () => {
    expect(isValidConnectionStats(null)).toBe(false);
    expect(isValidConnectionStats(undefined)).toBe(false);
    expect(isValidConnectionStats(42)).toBe(false);
  });
});
