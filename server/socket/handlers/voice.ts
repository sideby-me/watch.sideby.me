import { Socket, Server as IOServer } from 'socket.io';
import { SocketData, SocketEvents } from '../types';
import { validateData } from '../utils';
import { handleServiceError } from '../error-handler';
import {
  VoiceJoinDataSchema,
  VoiceLeaveDataSchema,
  VoiceOfferSchema,
  VoiceAnswerSchema,
  VoiceIceCandidateSchema,
} from '@/types';
import { VoiceService, createSocketContext } from '@/server/services';
import { logEvent } from '@/server/logger';

export function registerVoiceHandlers(socket: Socket<SocketEvents, SocketEvents, object, SocketData>, io: IOServer) {
  const slog = (event: string, extra?: Record<string, unknown>) => {
    logEvent({
      level: 'info',
      domain: 'voice',
      event: `voice_${event.replace(/-/g, '_').replace(/\s+/g, '_').toLowerCase()}`,
      message: `voice.signaling: ${event}`,
      roomId: socket.data.roomId,
      userId: socket.data.userId,
      meta: extra,
    });
  };

  // Join voice
  socket.on('voice-join', async data => {
    slog('voice-join received');

    try {
      const validated = validateData(VoiceJoinDataSchema, data, socket);
      if (!validated) return;

      const { roomId } = validated;
      const ctx = createSocketContext(socket.data);
      if (!ctx) {
        socket.emit('voice-error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      // Check permissions
      await VoiceService.canJoinVoice({ roomId }, ctx);

      const voiceRoomKey = `voice:${roomId}`;

      // Get current participants and cleanup stale
      let { sockets: currentParticipants, staleSocketIds } = VoiceService.computeValidParticipants(io, roomId);

      if (staleSocketIds.length) {
        slog('pruning stale voice sockets', { staleCount: staleSocketIds.length });
        await VoiceService.cleanupStaleSockets(io, roomId, staleSocketIds);
        ({ sockets: currentParticipants } = VoiceService.computeValidParticipants(io, roomId));
      }

      // If already in voice room, treat as idempotent
      if (socket.rooms.has(voiceRoomKey)) {
        slog('voice-join idempotent', { count: currentParticipants.length });
      } else {
        // Check capacity with retry
        if (currentParticipants.length >= VoiceService.getMaxParticipants()) {
          await new Promise(r => setTimeout(r, 30));
          ({ sockets: currentParticipants, staleSocketIds } = VoiceService.computeValidParticipants(io, roomId));
          if (staleSocketIds.length) {
            await VoiceService.cleanupStaleSockets(io, roomId, staleSocketIds);
            ({ sockets: currentParticipants } = VoiceService.computeValidParticipants(io, roomId));
          }
        }

        // Final capacity check
        VoiceService.checkCapacity(currentParticipants.length);

        await socket.join(voiceRoomKey);
        ({ sockets: currentParticipants } = VoiceService.computeValidParticipants(io, roomId));
        slog('joined voice room', { count: currentParticipants.length });
      }

      // Provide existing peers to new joiner
      const peerUserIds = currentParticipants
        .filter(s => s.id !== socket.id)
        .map(s => s.data.userId)
        .filter((id): id is string => Boolean(id));

      slog('sending existing peers', { count: peerUserIds.length });
      socket.emit('voice-existing-peers', { userIds: peerUserIds });

      // Notify others about this peer
      socket.to(voiceRoomKey).emit('voice-peer-joined', { userId: ctx.userId });
      slog('broadcasted peer-joined');

      // Broadcast updated count to whole main room
      const { sockets: participants } = VoiceService.computeValidParticipants(io, roomId);
      io.to(roomId).emit('voice-participant-count', {
        roomId,
        count: participants.length,
        max: VoiceService.getMaxParticipants(),
      });
    } catch (error) {
      handleServiceError(error, socket, 'voice-error');
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
      const before = VoiceService.computeValidParticipants(io, roomId).sockets.length;
      await socket.leave(voiceRoom);
      const after = VoiceService.computeValidParticipants(io, roomId).sockets.length;

      socket.to(voiceRoom).emit('voice-peer-left', { userId: socket.data.userId });
      slog('left voice room and broadcasted peer-left', { before, after });

      io.to(roomId).emit('voice-participant-count', {
        roomId,
        count: after,
        max: VoiceService.getMaxParticipants(),
      });
    } else {
      slog('voice-leave ignored: not in voice room');
    }
  });

  // WebRTC Signaling Relay
  socket.on('voice-offer', async data => {
    slog('voice-offer relay');
    const validated = validateData(VoiceOfferSchema, data, socket);
    if (!validated) return;

    const { targetUserId, sdp } = validated;
    const targetSocket = await VoiceService.findSocketByUserId(io, targetUserId);
    if (!targetSocket) {
      slog('voice-offer target not found', { targetUserId });
      socket.emit('voice-error', { error: "Couldn't connect to that user. They might have just left." });
      return;
    }
    targetSocket.emit('voice-offer-received', { fromUserId: socket.data.userId!, sdp });
  });

  socket.on('voice-answer', async data => {
    slog('voice-answer relay');
    const validated = validateData(VoiceAnswerSchema, data, socket);
    if (!validated) return;

    const { targetUserId, sdp } = validated;
    const targetSocket = await VoiceService.findSocketByUserId(io, targetUserId);
    if (!targetSocket) {
      slog('voice-answer target not found', { targetUserId });
      socket.emit('voice-error', { error: "Couldn't connect to that user. They might have just left." });
      return;
    }
    targetSocket.emit('voice-answer-received', { fromUserId: socket.data.userId!, sdp });
  });

  socket.on('voice-ice-candidate', async data => {
    slog('voice-ice relay');
    const validated = validateData(VoiceIceCandidateSchema, data, socket);
    if (!validated) return;

    const { targetUserId, candidate } = validated;
    const targetSocket = await VoiceService.findSocketByUserId(io, targetUserId);
    if (!targetSocket) {
      slog('voice-ice target not found', { targetUserId });
      socket.emit('voice-error', { error: "Couldn't connect to that user. They might have just left." });
      return;
    }
    targetSocket.emit('voice-ice-candidate-received', { fromUserId: socket.data.userId!, candidate });
  });

  // Disconnect handling
  socket.on('disconnecting', () => {
    slog('disconnecting');
    try {
      for (const room of socket.rooms) {
        if (room.startsWith('voice:') && socket.data.userId) {
          const rid = room.slice('voice:'.length);
          socket.to(room).emit('voice-peer-left', { userId: socket.data.userId });

          // Post-leave recount with delay
          setTimeout(() => {
            const { sockets: participants } = VoiceService.computeValidParticipants(io, rid);
            io.to(rid).emit('voice-participant-count', {
              roomId: rid,
              count: participants.length,
              max: VoiceService.getMaxParticipants(),
            });
          }, 10);
        }
      }
    } catch {
      // Ignore disconnect errors
    }
  });
}
