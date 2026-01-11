import { Socket, Server as IOServer } from 'socket.io';
import { SocketData, SocketEvents } from '../types';
import { validateData } from '../utils';
import { handleServiceError } from '../error-handler';
import {
  VideoChatJoinDataSchema,
  VideoChatLeaveDataSchema,
  VideoChatOfferSchema,
  VideoChatAnswerSchema,
  VideoChatIceCandidateSchema,
} from '@/types';
import { VideoChatService, createSocketContext } from '@/server/services';

export function registerVideoChatHandlers(
  socket: Socket<SocketEvents, SocketEvents, object, SocketData>,
  io: IOServer
) {
  const slog = (event: string, extra?: Record<string, unknown>) => {
    console.log('[VIDEOCHAT]', event, {
      socketId: socket.id,
      userId: socket.data.userId,
      roomId: socket.data.roomId,
      ...extra,
    });
  };

  socket.on('videochat-join', async data => {
    slog('join received');

    try {
      const validated = validateData(VideoChatJoinDataSchema, data, socket);
      if (!validated) return;

      const { roomId } = validated;
      const ctx = createSocketContext(socket.data);
      if (!ctx) {
        socket.emit('videochat-error', { error: 'Connection metadata missing.' });
        return;
      }

      // Check permissions
      await VideoChatService.canJoinVideoChat({ roomId }, ctx);

      const vcRoomKey = `videochat:${roomId}`;

      // Get current participants and cleanup stale
      let { sockets: current, staleSocketIds } = VideoChatService.computeValidParticipants(io, roomId);

      if (staleSocketIds.length) {
        await VideoChatService.cleanupStaleSockets(io, roomId, staleSocketIds);
        ({ sockets: current } = VideoChatService.computeValidParticipants(io, roomId));
      }

      // If not already in video chat room
      if (!socket.rooms.has(vcRoomKey)) {
        // Check capacity with retry
        if (current.length >= VideoChatService.getMaxParticipants()) {
          await new Promise(r => setTimeout(r, 30));
          ({ sockets: current } = VideoChatService.computeValidParticipants(io, roomId));
        }

        // Final capacity check
        VideoChatService.checkCapacity(current.length);

        await socket.join(vcRoomKey);
        ({ sockets: current } = VideoChatService.computeValidParticipants(io, roomId));
        slog('joined videochat', { count: current.length });
      }

      // Send existing peers
      const peers = current
        .filter(s => s.id !== socket.id)
        .map(s => s.data.userId!)
        .filter(Boolean);

      socket.emit('videochat-existing-peers', { userIds: peers });
      socket.to(vcRoomKey).emit('videochat-peer-joined', { userId: ctx.userId });

      // Broadcast updated count
      const { sockets: participants } = VideoChatService.computeValidParticipants(io, roomId);
      io.to(roomId).emit('videochat-participant-count', {
        roomId,
        count: participants.length,
        max: VideoChatService.getMaxParticipants(),
      });
    } catch (error) {
      handleServiceError(error, socket, 'videochat-error');
    }
  });

  // Leave video chat
  socket.on('videochat-leave', async data => {
    const validated = validateData(VideoChatLeaveDataSchema, data, socket);
    if (!validated) return;

    const { roomId } = validated;
    const vcRoomKey = `videochat:${roomId}`;

    if (socket.rooms.has(vcRoomKey)) {
      await socket.leave(vcRoomKey);
      socket.to(vcRoomKey).emit('videochat-peer-left', { userId: socket.data.userId });

      const { sockets: participants } = VideoChatService.computeValidParticipants(io, roomId);
      io.to(roomId).emit('videochat-participant-count', {
        roomId,
        count: participants.length,
        max: VideoChatService.getMaxParticipants(),
      });
    }
  });

  // WebRTC Signaling Relay
  socket.on('videochat-offer', async data => {
    const validated = validateData(VideoChatOfferSchema, data, socket);
    if (!validated) return;

    const { targetUserId } = validated;
    const targetSocket = await VideoChatService.findSocketByUserId(io, targetUserId);
    if (!targetSocket) {
      socket.emit('videochat-error', { error: 'Target user unavailable.' });
      return;
    }
    targetSocket.emit('videochat-offer-received', { fromUserId: socket.data.userId!, sdp: validated.sdp });
  });

  socket.on('videochat-answer', async data => {
    const validated = validateData(VideoChatAnswerSchema, data, socket);
    if (!validated) return;

    const { targetUserId } = validated;
    const targetSocket = await VideoChatService.findSocketByUserId(io, targetUserId);
    if (!targetSocket) {
      socket.emit('videochat-error', { error: 'Target user unavailable.' });
      return;
    }
    targetSocket.emit('videochat-answer-received', { fromUserId: socket.data.userId!, sdp: validated.sdp });
  });

  socket.on('videochat-ice-candidate', async data => {
    const validated = validateData(VideoChatIceCandidateSchema, data, socket);
    if (!validated) return;

    const { targetUserId, candidate } = validated;
    const targetSocket = await VideoChatService.findSocketByUserId(io, targetUserId);
    if (!targetSocket) return;
    targetSocket.emit('videochat-ice-candidate-received', { fromUserId: socket.data.userId!, candidate });
  });

  // Disconnect handling
  socket.on('disconnecting', () => {
    try {
      for (const room of socket.rooms) {
        if (room.startsWith('videochat:') && socket.data.userId) {
          socket.to(room).emit('videochat-peer-left', { userId: socket.data.userId });

          const rid = room.slice('videochat:'.length);
          setTimeout(() => {
            const { sockets: participants } = VideoChatService.computeValidParticipants(io, rid);
            io.to(rid).emit('videochat-participant-count', {
              roomId: rid,
              count: participants.length,
              max: VideoChatService.getMaxParticipants(),
            });
          }, 10);
        }
      }
    } catch {
      // Ignore disconnect errors
    }
  });
}
