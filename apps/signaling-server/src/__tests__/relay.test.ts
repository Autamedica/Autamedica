import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RTCSessionDescriptionInit,
  RTCIceCandidateInit,
  ConnectionStats,
} from '../types.js';
import {
  isValidSDP,
  isValidIceCandidate,
  isValidRoomId,
  isValidConnectionStats,
} from '../validation.js';

/**
 * Simulates the relay logic from server.ts event handlers.
 *
 * The signaling server receives events from one socket and forwards them
 * to all other sockets in the same room via `socket.to(roomId).emit(...)`.
 * These tests verify:
 *   1. Valid messages are relayed with correct shape
 *   2. Invalid messages are rejected before relay
 *   3. Rate-limited messages are dropped
 */

function createMockSocket(userId: string, role: 'patient' | 'doctor' = 'patient') {
  const roomEmit = vi.fn();
  const toRoom = vi.fn(() => ({ emit: roomEmit }));

  return {
    id: `socket-${userId}`,
    data: { userId, userRole: role },
    emit: vi.fn(),
    to: toRoom,
    _roomEmit: roomEmit,
    _toRoom: toRoom,
  };
}

type MockSocket = ReturnType<typeof createMockSocket>;

function handleOffer(
  socket: MockSocket,
  data: { roomId: string; offer: RTCSessionDescriptionInit },
  rateLimitOk: boolean,
) {
  if (!rateLimitOk) {
    socket.emit('error', { message: 'Rate limit exceeded' });
    return;
  }
  if (!isValidRoomId(data.roomId)) {
    socket.emit('error', { message: 'Invalid room ID' });
    return;
  }
  if (!isValidSDP(data.offer)) {
    socket.emit('error', { message: 'Invalid SDP offer' });
    return;
  }
  socket.to(data.roomId).emit('offer', {
    roomId: data.roomId,
    userId: socket.data.userId,
    offer: data.offer,
  });
}

function handleAnswer(
  socket: MockSocket,
  data: { roomId: string; answer: RTCSessionDescriptionInit },
  rateLimitOk: boolean,
) {
  if (!rateLimitOk) {
    socket.emit('error', { message: 'Rate limit exceeded' });
    return;
  }
  if (!isValidRoomId(data.roomId)) {
    socket.emit('error', { message: 'Invalid room ID' });
    return;
  }
  if (!isValidSDP(data.answer)) {
    socket.emit('error', { message: 'Invalid SDP answer' });
    return;
  }
  socket.to(data.roomId).emit('answer', {
    roomId: data.roomId,
    userId: socket.data.userId,
    answer: data.answer,
  });
}

function handleIceCandidate(
  socket: MockSocket,
  data: { roomId: string; candidate: RTCIceCandidateInit },
  rateLimitOk: boolean,
) {
  if (!rateLimitOk) {
    socket.emit('error', { message: 'Rate limit exceeded' });
    return;
  }
  if (!isValidRoomId(data.roomId)) {
    socket.emit('error', { message: 'Invalid room ID' });
    return;
  }
  if (!isValidIceCandidate(data.candidate)) {
    socket.emit('error', { message: 'Invalid ICE candidate' });
    return;
  }
  socket.to(data.roomId).emit('ice-candidate', {
    roomId: data.roomId,
    userId: socket.data.userId,
    candidate: data.candidate,
  });
}

function handleCallInit(
  socket: MockSocket,
  data: { roomId: string },
  rateLimitOk: boolean,
) {
  if (!rateLimitOk) {
    socket.emit('error', { message: 'Rate limit exceeded' });
    return;
  }
  if (!isValidRoomId(data.roomId)) {
    socket.emit('error', { message: 'Invalid room ID' });
    return;
  }
  socket.to(data.roomId).emit('call-init', {
    roomId: data.roomId,
    userId: socket.data.userId,
  });
}

function handleCallEnd(
  socket: MockSocket,
  data: { roomId: string },
  rateLimitOk: boolean,
) {
  if (!rateLimitOk) {
    socket.emit('error', { message: 'Rate limit exceeded' });
    return;
  }
  if (!isValidRoomId(data.roomId)) {
    socket.emit('error', { message: 'Invalid room ID' });
    return;
  }
  socket.to(data.roomId).emit('call-end', {
    roomId: data.roomId,
    userId: socket.data.userId,
  });
}

function handleConnectionStats(
  socket: MockSocket,
  data: { roomId: string; stats: ConnectionStats },
  rateLimitOk: boolean,
) {
  if (!rateLimitOk) {
    socket.emit('error', { message: 'Rate limit exceeded' });
    return;
  }
  if (!isValidRoomId(data.roomId)) {
    socket.emit('error', { message: 'Invalid room ID' });
    return;
  }
  if (!isValidConnectionStats(data.stats)) {
    socket.emit('error', { message: 'Invalid connection stats' });
    return;
  }
  socket.to(data.roomId).emit('peer-stats', {
    roomId: data.roomId,
    userId: socket.data.userId,
    stats: data.stats,
  });
}

// ---------------------------------------------------------------------------

describe('Relay: SDP Offer forwarding', () => {
  let doctor: MockSocket;
  const roomId = 'room-abc';

  beforeEach(() => {
    doctor = createMockSocket('doctor-1', 'doctor');
  });

  it('relays a valid offer to the room', () => {
    const offer: RTCSessionDescriptionInit = { type: 'offer', sdp: 'v=0\r\no=- ...' };
    handleOffer(doctor, { roomId, offer }, true);

    expect(doctor._toRoom).toHaveBeenCalledWith(roomId);
    expect(doctor._roomEmit).toHaveBeenCalledWith('offer', {
      roomId,
      userId: 'doctor-1',
      offer,
    });
  });

  it('rejects an offer with invalid SDP type', () => {
    const badOffer = { type: 'invalid' } as unknown as RTCSessionDescriptionInit;
    handleOffer(doctor, { roomId, offer: badOffer }, true);

    expect(doctor.emit).toHaveBeenCalledWith('error', { message: 'Invalid SDP offer' });
    expect(doctor._roomEmit).not.toHaveBeenCalled();
  });

  it('rejects an offer with non-string SDP body', () => {
    const badOffer = { type: 'offer', sdp: 42 } as unknown as RTCSessionDescriptionInit;
    handleOffer(doctor, { roomId, offer: badOffer }, true);

    expect(doctor.emit).toHaveBeenCalledWith('error', { message: 'Invalid SDP offer' });
    expect(doctor._roomEmit).not.toHaveBeenCalled();
  });

  it('rejects an offer with invalid roomId', () => {
    const offer: RTCSessionDescriptionInit = { type: 'offer', sdp: 'v=0' };
    handleOffer(doctor, { roomId: '../escape', offer }, true);

    expect(doctor.emit).toHaveBeenCalledWith('error', { message: 'Invalid room ID' });
    expect(doctor._roomEmit).not.toHaveBeenCalled();
  });

  it('drops the offer when rate-limited', () => {
    const offer: RTCSessionDescriptionInit = { type: 'offer', sdp: 'v=0' };
    handleOffer(doctor, { roomId, offer }, false);

    expect(doctor.emit).toHaveBeenCalledWith('error', { message: 'Rate limit exceeded' });
    expect(doctor._roomEmit).not.toHaveBeenCalled();
  });

  it('attaches the sender userId so the receiver knows who sent it', () => {
    const offer: RTCSessionDescriptionInit = { type: 'offer', sdp: 'v=0' };
    const patient = createMockSocket('patient-1', 'patient');
    handleOffer(patient, { roomId, offer }, true);

    const relayed = patient._roomEmit.mock.calls[0][1] as Record<string, unknown>;
    expect(relayed.userId).toBe('patient-1');
  });
});

describe('Relay: SDP Answer forwarding', () => {
  let patient: MockSocket;
  const roomId = 'room-abc';

  beforeEach(() => {
    patient = createMockSocket('patient-1', 'patient');
  });

  it('relays a valid answer to the room', () => {
    const answer: RTCSessionDescriptionInit = { type: 'answer', sdp: 'v=0\r\n...' };
    handleAnswer(patient, { roomId, answer }, true);

    expect(patient._toRoom).toHaveBeenCalledWith(roomId);
    expect(patient._roomEmit).toHaveBeenCalledWith('answer', {
      roomId,
      userId: 'patient-1',
      answer,
    });
  });

  it('rejects answer with invalid SDP', () => {
    const bad = { type: 'wrong' } as unknown as RTCSessionDescriptionInit;
    handleAnswer(patient, { roomId, answer: bad }, true);

    expect(patient.emit).toHaveBeenCalledWith('error', { message: 'Invalid SDP answer' });
    expect(patient._roomEmit).not.toHaveBeenCalled();
  });

  it('drops when rate-limited', () => {
    const answer: RTCSessionDescriptionInit = { type: 'answer', sdp: 'v=0' };
    handleAnswer(patient, { roomId, answer }, false);

    expect(patient.emit).toHaveBeenCalledWith('error', { message: 'Rate limit exceeded' });
    expect(patient._roomEmit).not.toHaveBeenCalled();
  });
});

describe('Relay: ICE Candidate forwarding', () => {
  let doctor: MockSocket;
  const roomId = 'room-ice';

  beforeEach(() => {
    doctor = createMockSocket('doctor-1', 'doctor');
  });

  it('relays a full ICE candidate', () => {
    const candidate: RTCIceCandidateInit = {
      candidate: 'candidate:842163049 1 udp 1677729535 ...',
      sdpMLineIndex: 0,
      sdpMid: 'audio',
    };
    handleIceCandidate(doctor, { roomId, candidate }, true);

    expect(doctor._toRoom).toHaveBeenCalledWith(roomId);
    expect(doctor._roomEmit).toHaveBeenCalledWith('ice-candidate', {
      roomId,
      userId: 'doctor-1',
      candidate,
    });
  });

  it('relays an empty ICE candidate (end-of-candidates signal)', () => {
    const candidate: RTCIceCandidateInit = {};
    handleIceCandidate(doctor, { roomId, candidate }, true);

    expect(doctor._roomEmit).toHaveBeenCalledWith(
      'ice-candidate',
      expect.objectContaining({ roomId, candidate: {} }),
    );
  });

  it('rejects candidate with non-string candidate field', () => {
    const bad = { candidate: 42 } as unknown as RTCIceCandidateInit;
    handleIceCandidate(doctor, { roomId, candidate: bad }, true);

    expect(doctor.emit).toHaveBeenCalledWith('error', { message: 'Invalid ICE candidate' });
    expect(doctor._roomEmit).not.toHaveBeenCalled();
  });

  it('rejects candidate with non-numeric sdpMLineIndex', () => {
    const bad = { sdpMLineIndex: 'zero' } as unknown as RTCIceCandidateInit;
    handleIceCandidate(doctor, { roomId, candidate: bad }, true);

    expect(doctor.emit).toHaveBeenCalledWith('error', { message: 'Invalid ICE candidate' });
    expect(doctor._roomEmit).not.toHaveBeenCalled();
  });

  it('drops when rate-limited', () => {
    const candidate: RTCIceCandidateInit = { candidate: 'candidate:...' };
    handleIceCandidate(doctor, { roomId, candidate }, false);

    expect(doctor.emit).toHaveBeenCalledWith('error', { message: 'Rate limit exceeded' });
    expect(doctor._roomEmit).not.toHaveBeenCalled();
  });
});

describe('Relay: call-init / call-end', () => {
  let doctor: MockSocket;
  const roomId = 'room-call';

  beforeEach(() => {
    doctor = createMockSocket('doctor-1', 'doctor');
  });

  it('relays call-init to the room', () => {
    handleCallInit(doctor, { roomId }, true);

    expect(doctor._toRoom).toHaveBeenCalledWith(roomId);
    expect(doctor._roomEmit).toHaveBeenCalledWith('call-init', {
      roomId,
      userId: 'doctor-1',
    });
  });

  it('relays call-end to the room', () => {
    handleCallEnd(doctor, { roomId }, true);

    expect(doctor._toRoom).toHaveBeenCalledWith(roomId);
    expect(doctor._roomEmit).toHaveBeenCalledWith('call-end', {
      roomId,
      userId: 'doctor-1',
    });
  });

  it('rejects call-init with invalid roomId', () => {
    handleCallInit(doctor, { roomId: '' }, true);

    expect(doctor.emit).toHaveBeenCalledWith('error', { message: 'Invalid room ID' });
    expect(doctor._roomEmit).not.toHaveBeenCalled();
  });

  it('rejects call-end with path traversal roomId', () => {
    handleCallEnd(doctor, { roomId: '../../secret' }, true);

    expect(doctor.emit).toHaveBeenCalledWith('error', { message: 'Invalid room ID' });
    expect(doctor._roomEmit).not.toHaveBeenCalled();
  });

  it('drops call-init when rate-limited', () => {
    handleCallInit(doctor, { roomId }, false);

    expect(doctor.emit).toHaveBeenCalledWith('error', { message: 'Rate limit exceeded' });
    expect(doctor._roomEmit).not.toHaveBeenCalled();
  });
});

describe('Relay: connection-stats forwarding', () => {
  let patient: MockSocket;
  const roomId = 'room-stats';

  beforeEach(() => {
    patient = createMockSocket('patient-1', 'patient');
  });

  const validStats: ConnectionStats = {
    bitrate: 2500,
    latency: 45,
    packetLoss: 0.01,
    quality: 'excellent',
  };

  it('relays valid connection stats as peer-stats', () => {
    handleConnectionStats(patient, { roomId, stats: validStats }, true);

    expect(patient._toRoom).toHaveBeenCalledWith(roomId);
    expect(patient._roomEmit).toHaveBeenCalledWith('peer-stats', {
      roomId,
      userId: 'patient-1',
      stats: validStats,
    });
  });

  it('rejects stats with unknown quality level', () => {
    const bad = { ...validStats, quality: 'terrible' } as unknown as ConnectionStats;
    handleConnectionStats(patient, { roomId, stats: bad }, true);

    expect(patient.emit).toHaveBeenCalledWith('error', { message: 'Invalid connection stats' });
    expect(patient._roomEmit).not.toHaveBeenCalled();
  });

  it('rejects stats with non-numeric bitrate', () => {
    const bad = { ...validStats, bitrate: '2500' } as unknown as ConnectionStats;
    handleConnectionStats(patient, { roomId, stats: bad }, true);

    expect(patient.emit).toHaveBeenCalledWith('error', { message: 'Invalid connection stats' });
    expect(patient._roomEmit).not.toHaveBeenCalled();
  });

  it('drops when rate-limited', () => {
    handleConnectionStats(patient, { roomId, stats: validStats }, false);

    expect(patient.emit).toHaveBeenCalledWith('error', { message: 'Rate limit exceeded' });
    expect(patient._roomEmit).not.toHaveBeenCalled();
  });
});

describe('Relay: guard validation layer', () => {
  let socket: MockSocket;

  beforeEach(() => {
    socket = createMockSocket('user-1');
  });

  it('blocks relay when roomId contains spaces', () => {
    const offer: RTCSessionDescriptionInit = { type: 'offer', sdp: 'v=0' };
    handleOffer(socket, { roomId: 'room with spaces', offer }, true);

    expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Invalid room ID' });
    expect(socket._roomEmit).not.toHaveBeenCalled();
  });

  it('blocks relay when roomId contains special chars', () => {
    const offer: RTCSessionDescriptionInit = { type: 'offer', sdp: 'v=0' };
    handleOffer(socket, { roomId: 'room@hack!', offer }, true);

    expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Invalid room ID' });
    expect(socket._roomEmit).not.toHaveBeenCalled();
  });

  it('blocks relay when roomId exceeds max length', () => {
    const offer: RTCSessionDescriptionInit = { type: 'offer', sdp: 'v=0' };
    handleOffer(socket, { roomId: 'a'.repeat(129), offer }, true);

    expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Invalid room ID' });
    expect(socket._roomEmit).not.toHaveBeenCalled();
  });

  it('allows relay with max-length roomId (128 chars)', () => {
    const offer: RTCSessionDescriptionInit = { type: 'offer', sdp: 'v=0' };
    handleOffer(socket, { roomId: 'a'.repeat(128), offer }, true);

    expect(socket._roomEmit).toHaveBeenCalled();
  });
});
