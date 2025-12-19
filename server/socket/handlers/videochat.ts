import { Socket, Server as IOServer } from 'socket.io';
import { SocketData, SocketEvents } from '../types';
import { validateData } from '../utils';
import {
  VideoChatJoinDataSchema,
  VideoChatLeaveDataSchema,
  VideoChatOfferSchema,
  VideoChatAnswerSchema,
  VideoChatIceCandidateSchema,
} from '@/types';
import { redisService } from '@/server/redis';

const VIDEOCHAT_MAX_PARTICIPANTS = 5;

function computeValidVideoChatParticipants(
  io: IOServer,
  roomId: string
): { sockets: Socket<SocketEvents, SocketEvents, object, SocketData>[]; staleSocketIds: string[] } {
  const vcRoomKey = `videochat:${roomId}`;
  const rawIds = Array.from(io.sockets.adapter.rooms.get(vcRoomKey) || new Set<string>());
  const sockets: Socket<SocketEvents, SocketEvents, object, SocketData>[] = [];
  const stale: string[] = [];
  for (const id of rawIds) {
    const s = io.sockets.sockets.get(id) as Socket<SocketEvents, SocketEvents, object, SocketData> | undefined;
    if (s && s.data.userId && s.data.roomId === roomId) sockets.push(s);
    else stale.push(id);
  }
  return { sockets, staleSocketIds: stale };
}

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
    const validated = validateData(VideoChatJoinDataSchema, data, socket);
    if (!validated) return;
    const { roomId } = validated;
    if (!socket.data.userId) {
      socket.emit('videochat-error', { error: 'Connection metadata missing.' });
      return;
    }
    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      socket.emit('videochat-error', { error: "We couldn't find that room." });
      return;
    }

    // Check if chat is locked for non-hosts
    if (room.settings?.isChatLocked) {
      const user = room.users.find(u => u.id === socket.data.userId);
      if (!user?.isHost) {
        socket.emit('videochat-error', { error: 'Video chat is currently locked. Only hosts can join.' });
        return;
      }
    }

    const vcRoomKey = `videochat:${roomId}`;
    let { sockets: current, staleSocketIds } = computeValidVideoChatParticipants(io, roomId);
    if (staleSocketIds.length) {
      for (const sid of staleSocketIds) {
        const s = io.sockets.sockets.get(sid);
        try {
          if (s) s.leave(vcRoomKey);
        } catch {}
      }
      ({ sockets: current } = computeValidVideoChatParticipants(io, roomId));
    }
    if (!socket.rooms.has(vcRoomKey)) {
      if (current.length >= VIDEOCHAT_MAX_PARTICIPANTS) {
        // Quick second pass
        await new Promise(r => setTimeout(r, 30));
        ({ sockets: current } = computeValidVideoChatParticipants(io, roomId));
        if (current.length >= VIDEOCHAT_MAX_PARTICIPANTS) {
          socket.emit('videochat-error', {
            error: `Whoa, it's a full house! The video channel is at its max of 5 people, unless Hulk's in the room.`,
          });
          return;
        }
      }
      await socket.join(vcRoomKey);
      ({ sockets: current } = computeValidVideoChatParticipants(io, roomId));
      slog('joined videochat', { count: current.length });
    }
    // Send existing peers (userIds)
    const peers = current
      .filter(s => s.id !== socket.id)
      .map(s => s.data.userId!)
      .filter(Boolean);
    socket.emit('videochat-existing-peers', { userIds: peers });
    socket.to(vcRoomKey).emit('videochat-peer-joined', { userId: socket.data.userId });
    try {
      const { sockets: participants } = computeValidVideoChatParticipants(io, roomId);
      io.to(roomId).emit('videochat-participant-count', {
        roomId,
        count: participants.length,
        max: VIDEOCHAT_MAX_PARTICIPANTS,
      });
    } catch {}
  });

  socket.on('videochat-leave', async data => {
    const validated = validateData(VideoChatLeaveDataSchema, data, socket);
    if (!validated) return;
    const { roomId } = validated;
    const vcRoomKey = `videochat:${roomId}`;
    if (socket.rooms.has(vcRoomKey)) {
      await socket.leave(vcRoomKey);
      socket.to(vcRoomKey).emit('videochat-peer-left', { userId: socket.data.userId });
      try {
        const { sockets: participants } = computeValidVideoChatParticipants(io, roomId);
        io.to(roomId).emit('videochat-participant-count', {
          roomId,
          count: participants.length,
          max: VIDEOCHAT_MAX_PARTICIPANTS,
        });
      } catch {}
    }
  });

  socket.on('videochat-offer', async data => {
    const validated = validateData(VideoChatOfferSchema, data, socket);
    if (!validated) return;
    const { targetUserId } = validated;
    const targetSocket = await findSocketByUserId(io, targetUserId);
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
    const targetSocket = await findSocketByUserId(io, targetUserId);
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
    const targetSocket = await findSocketByUserId(io, targetUserId);
    if (!targetSocket) return;
    targetSocket.emit('videochat-ice-candidate-received', { fromUserId: socket.data.userId!, candidate });
  });

  socket.on('disconnecting', () => {
    try {
      for (const room of socket.rooms) {
        if (room.startsWith('videochat:') && socket.data.userId) {
          socket.to(room).emit('videochat-peer-left', { userId: socket.data.userId });
          const rid = room.slice('videochat:'.length);
          setTimeout(() => {
            try {
              const { sockets: participants } = computeValidVideoChatParticipants(io, rid);
              io.to(rid).emit('videochat-participant-count', {
                roomId: rid,
                count: participants.length,
                max: VIDEOCHAT_MAX_PARTICIPANTS,
              });
            } catch {}
          }, 10);
        }
      }
    } catch {}
  });
}

async function findSocketByUserId(
  io: IOServer,
  userId: string
): Promise<Socket<SocketEvents, SocketEvents, object, SocketData> | undefined> {
  try {
    const socketId = await redisService.userMapping.getUserSocket(userId);
    if (!socketId) return undefined;
    const socket = io.sockets.sockets.get(socketId) as
      | Socket<SocketEvents, SocketEvents, object, SocketData>
      | undefined;
    if (socket && socket.data.userId === userId) return socket;
    if (!socket || socket.data.userId !== userId) await redisService.userMapping.removeUserSocket(userId);
    return undefined;
  } catch {
    return undefined;
  }
}
