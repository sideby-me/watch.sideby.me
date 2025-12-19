import { Socket, Server as IOServer } from 'socket.io';
import { SocketData, SocketEvents } from '../types';
import { validateData } from '../utils';
import {
  VoiceJoinDataSchema,
  VoiceLeaveDataSchema,
  VoiceOfferSchema,
  VoiceAnswerSchema,
  VoiceIceCandidateSchema,
} from '@/types';
import { redisService } from '@/server/redis';

// compute valid voice participants from adapter each time
function computeValidVoiceParticipants(
  io: IOServer,
  roomId: string
): { sockets: Socket<SocketEvents, SocketEvents, object, SocketData>[]; staleSocketIds: string[] } {
  const voiceRoomKey = `voice:${roomId}`;
  const rawIds = Array.from(io.sockets.adapter.rooms.get(voiceRoomKey) || new Set<string>());
  const sockets: Socket<SocketEvents, SocketEvents, object, SocketData>[] = [];
  const stale: string[] = [];
  for (const id of rawIds) {
    const s = io.sockets.sockets.get(id) as Socket<SocketEvents, SocketEvents, object, SocketData> | undefined;
    if (s && s.data.userId && s.data.roomId === roomId) {
      sockets.push(s);
    } else {
      stale.push(id);
    }
  }
  return { sockets, staleSocketIds: stale };
}

// Soft cap for voice participants in mesh
const VOICE_MAX_PARTICIPANTS = 5;

export function registerVoiceHandlers(socket: Socket<SocketEvents, SocketEvents, object, SocketData>, io: IOServer) {
  const slog = (event: string, extra?: Record<string, unknown>) => {
    console.log('[VOICE]', event, {
      socketId: socket.id,
      userId: socket.data.userId,
      roomId: socket.data.roomId,
      ...extra,
    });
  };
  // Join voice
  socket.on('voice-join', async data => {
    slog('voice-join received');
    const validated = validateData(VoiceJoinDataSchema, data, socket);
    if (!validated) return;

    const { roomId } = validated;
    if (!socket.data.userId) {
      socket.emit('voice-error', { error: `Hmm, we lost your connection details.` });
      return;
    }

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      socket.emit('voice-error', { error: `Hmm, we couldn't find a room with that code. Maybe a typo?` });
      return;
    }

    // Check if chat is locked for non-hosts
    if (room.settings?.isChatLocked) {
      const user = room.users.find(u => u.id === socket.data.userId);
      if (!user?.isHost) {
        socket.emit('voice-error', { error: 'Voice chat is currently locked. Only hosts can join.' });
        return;
      }
    }

    const voiceRoomKey = `voice:${roomId}`;

    // If already in voice room, treat as idempotent (re-send peers later)
    let { sockets: currentParticipants, staleSocketIds } = computeValidVoiceParticipants(io, roomId);

    // Attempt cleanup of stale entries (sockets without proper metadata / membership)
    if (staleSocketIds.length) {
      slog('pruning stale voice sockets', { staleCount: staleSocketIds.length });
      for (const sid of staleSocketIds) {
        const s = io.sockets.sockets.get(sid) as Socket<SocketEvents, SocketEvents, object, SocketData> | undefined;
        try {
          if (s) s.leave(voiceRoomKey);
        } catch {}
      }
      // Recompute after pruning
      ({ sockets: currentParticipants } = computeValidVoiceParticipants(io, roomId));
    }

    if (socket.rooms.has(voiceRoomKey)) {
      slog('voice-join idempotent', { count: currentParticipants.length });
    } else {
      if (currentParticipants.length >= VOICE_MAX_PARTICIPANTS) {
        // One more defensive recompute in case of racing leave
        await new Promise(r => setTimeout(r, 30));
        ({ sockets: currentParticipants, staleSocketIds } = computeValidVoiceParticipants(io, roomId));
        if (staleSocketIds.length) {
          slog('2nd-pass pruning stale sockets', { stale: staleSocketIds });
          for (const sid of staleSocketIds) {
            const s = io.sockets.sockets.get(sid) as Socket<SocketEvents, SocketEvents, object, SocketData> | undefined;
            try {
              if (s) s.leave(voiceRoomKey);
            } catch {}
          }
          ({ sockets: currentParticipants } = computeValidVoiceParticipants(io, roomId));
        }
      }

      if (currentParticipants.length >= VOICE_MAX_PARTICIPANTS) {
        slog('voice-join rejected: full', { current: currentParticipants.length });
        socket.emit('voice-error', {
          error: `Whoa, it's a full house! The voice channel is at its max of 5 people, unless Hulk's in the room.`,
        });
        return;
      }

      await socket.join(voiceRoomKey);
      ({ sockets: currentParticipants } = computeValidVoiceParticipants(io, roomId));
      slog('joined voice room', { count: currentParticipants.length });
    }

    // Provide existing peers to new joiner
    const peers = Array.from(io.sockets.adapter.rooms.get(`voice:${roomId}`) || new Set<string>()).filter(
      id => id !== socket.id
    );

    // Map socket ids in voice room to userIds but only if the socket is still in the main room
    const peerUserIds = peers
      .map(id => io.sockets.sockets.get(id) as Socket<SocketEvents, SocketEvents, object, SocketData> | undefined)
      .filter((s): s is Socket<SocketEvents, SocketEvents, object, SocketData> => Boolean(s))
      .filter(s => s.data.roomId === roomId)
      .map(s => s.data.userId)
      .filter((id): id is string => Boolean(id));

    slog('sending existing peers', { count: peerUserIds.length });
    socket.emit('voice-existing-peers', { userIds: peerUserIds });

    // Notify others about this peer
    socket.to(`voice:${roomId}`).emit('voice-peer-joined', { userId: socket.data.userId });
    slog('broadcasted peer-joined');

    // Broadcast updated count (to whole main room, so non-joined users can see occupancy)
    try {
      const { sockets: participants } = computeValidVoiceParticipants(io, roomId);
      io.to(roomId).emit('voice-participant-count', {
        roomId,
        count: participants.length,
        max: VOICE_MAX_PARTICIPANTS,
      });
    } catch (err) {
      slog('error broadcasting participant count after join', { err: String(err) });
    }
  });

  // Leave voice
  socket.on('voice-leave', async data => {
    slog('voice-leave received');
    const validated = validateData(VoiceLeaveDataSchema, data, socket);
    if (!validated) return;
    const { roomId } = validated;
    if (!socket.data.userId) return;
    const voiceRoom = `voice:${roomId}`;
    if (socket.rooms.has(voiceRoom)) {
      const before = computeValidVoiceParticipants(io, roomId).sockets.length;
      await socket.leave(voiceRoom);
      const after = computeValidVoiceParticipants(io, roomId).sockets.length;
      socket.to(voiceRoom).emit('voice-peer-left', { userId: socket.data.userId });
      slog('left voice room and broadcasted peer-left', { before, after });
      // Broadcast updated count to main room
      try {
        io.to(roomId).emit('voice-participant-count', {
          roomId,
          count: after,
          max: VOICE_MAX_PARTICIPANTS,
        });
      } catch (err) {
        slog('error broadcasting participant count after leave', { err: String(err) });
      }
    } else {
      slog('voice-leave ignored: not in voice room');
    }
  });

  // Relay offer (include sender id)
  socket.on('voice-offer', async data => {
    slog('voice-offer relay');
    const validated = validateData(VoiceOfferSchema, data, socket);
    if (!validated) return;
    const { roomId: _roomId, targetUserId, sdp } = validated;
    // Find socket for target user in room
    const targetSocket = await findSocketByUserId(io, targetUserId);
    if (!targetSocket) {
      slog('voice-offer target not found', { targetUserId });
      socket.emit('voice-error', { error: `Couldn't connect to that user. They might have just left.` });
      return;
    }
    targetSocket.emit('voice-offer-received', { fromUserId: socket.data.userId!, sdp });
  });

  // Relay answer (include sender id)
  socket.on('voice-answer', async data => {
    slog('voice-answer relay');
    const validated = validateData(VoiceAnswerSchema, data, socket);
    if (!validated) return;
    const { roomId: _roomId2, targetUserId, sdp } = validated;
    const targetSocket = await findSocketByUserId(io, targetUserId);
    if (!targetSocket) {
      slog('voice-answer target not found', { targetUserId });
      socket.emit('voice-error', { error: `Couldn't connect to that user. They might have just left.` });
      return;
    }
    targetSocket.emit('voice-answer-received', { fromUserId: socket.data.userId!, sdp });
  });

  // Relay ICE candidates (include sender id)
  socket.on('voice-ice-candidate', async data => {
    slog('voice-ice relay');
    const validated = validateData(VoiceIceCandidateSchema, data, socket);
    if (!validated) return;
    const { roomId: _roomId3, targetUserId, candidate } = validated;
    const targetSocket = await findSocketByUserId(io, targetUserId);
    if (!targetSocket) {
      slog('voice-ice target not found', { targetUserId });
      socket.emit('voice-error', { error: `Couldn't connect to that user. They might have just left.` });
      return;
    }
    targetSocket.emit('voice-ice-candidate-received', { fromUserId: socket.data.userId!, candidate });
  });

  // Ensure peers are notified on disconnect
  socket.on('disconnecting', () => {
    slog('disconnecting');
    try {
      const rooms = socket.rooms;
      for (const room of rooms) {
        if (room.startsWith('voice:') && socket.data.userId) {
          const rid = room.slice('voice:'.length);
          const before = computeValidVoiceParticipants(io, rid).sockets.length;
          socket.to(room).emit('voice-peer-left', { userId: socket.data.userId });
          const maybePromise = socket.leave(room);
          if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
            (maybePromise as Promise<void>).catch(() => {});
          }
          // Post-leave recount (slight delay to allow adapter update)
          setTimeout(() => {
            const after = computeValidVoiceParticipants(io, rid).sockets.length;
            slog('broadcasted peer-left on disconnect', { room, before, after });
            try {
              io.to(rid).emit('voice-participant-count', {
                roomId: rid,
                count: after,
                max: VOICE_MAX_PARTICIPANTS,
              });
            } catch {}
          }, 10);
        }
      }
    } catch {
      // ignore
    }
  });

  // Debug endpoint (development aid)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- debug channel not part of strict event map
  (socket as any).on('voice-debug', async (data: { roomId: string }) => {
    const validated = validateData(VoiceJoinDataSchema, data, socket); // reuse roomId schema
    if (!validated) return;
    const { roomId } = validated;
    const { sockets: participants, staleSocketIds } = computeValidVoiceParticipants(io, roomId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).emit('voice-debug-response', {
      roomId,
      count: participants.length,
      userIds: participants.map(s => s.data.userId),
      staleSocketIds,
      max: VOICE_MAX_PARTICIPANTS,
    });
  });
}

// Efficiently find a socket by userId using Redis mapping
async function findSocketByUserId(
  io: IOServer,
  userId: string
): Promise<Socket<SocketEvents, SocketEvents, object, SocketData> | undefined> {
  try {
    // Get socketId from Redis mapping
    const socketId = await redisService.userMapping.getUserSocket(userId);
    if (!socketId) {
      return undefined;
    }

    // Get socket from Socket.IO using the mapped socketId
    const socket = io.sockets.sockets.get(socketId) as
      | Socket<SocketEvents, SocketEvents, object, SocketData>
      | undefined;

    // Verify the socket still exists and has the correct userId
    if (socket && socket.data.userId === userId) {
      return socket;
    }

    // If socket doesn't exist or userId doesn't match, clean up stale mapping
    if (!socket || socket.data.userId !== userId) {
      await redisService.userMapping.removeUserSocket(userId);
    }

    return undefined;
  } catch (error) {
    console.error('Error finding socket by userId:', error);
    return undefined;
  }
}
