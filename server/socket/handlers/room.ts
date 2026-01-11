import { Socket, Server as IOServer } from 'socket.io';
import {
  CreateRoomDataSchema,
  JoinRoomDataSchema,
  RoomActionDataSchema,
  KickUserDataSchema,
  UpdateRoomSettingsDataSchema,
  VerifyPasscodeDataSchema,
} from '@/types';
import { SocketEvents, SocketData } from '../types';
import { validateData, emitSystemMessage } from '../utils';
import { handleServiceError } from '../error-handler';
import { RoomService, createSocketContext } from '@/server/services';
import { redisService } from '@/server/redis';
import { PasscodeRequiredError } from '@/server/errors';

export function registerRoomHandlers(socket: Socket<SocketEvents, SocketEvents, object, SocketData>, io: IOServer) {
  // Voice participant count helper (so late joiners immediately see current voice occupancy)
  function computeVoiceParticipantCount(roomId: string): number {
    const voiceRoomKey = `voice:${roomId}`;
    const rawIds = Array.from(io.sockets.adapter.rooms.get(voiceRoomKey) || new Set<string>());
    let count = 0;
    for (const id of rawIds) {
      const s = io.sockets.sockets.get(id) as Socket<SocketEvents, SocketEvents, object, SocketData> | undefined;
      if (s && s.data.userId && s.data.roomId === roomId) count++;
    }
    return count;
  }

  function emitVoiceParticipantCountToSocket(roomId: string) {
    try {
      const count = computeVoiceParticipantCount(roomId);
      if (count >= 0) {
        socket.emit('voice-participant-count', { roomId, count, max: 5 });
      }
    } catch (err) {
      console.warn('Failed to emit voice participant count on room join', { roomId, err });
    }
  }

  // Create room
  socket.on('create-room', async data => {
    try {
      const validatedData = validateData(CreateRoomDataSchema, data, socket);
      if (!validatedData) return;

      const result = await RoomService.createRoom({ hostName: validatedData.hostName });

      // Set socket data
      socket.data.userId = result.user.id;
      socket.data.userName = result.user.name;
      socket.data.roomId = result.room.id;

      // Join socket room
      await socket.join(result.room.id);

      // Store user-socket mapping
      await redisService.userMapping.setUserSocket(result.user.id, socket.id);

      // Emit events
      socket.emit('room-created', { roomId: result.room.id, room: result.room, hostToken: result.hostToken });
      socket.emit('room-joined', { room: result.room, user: result.user });
      emitVoiceParticipantCountToSocket(result.room.id);

      console.log(`Room ${result.room.id} created by ${result.user.name} with token ${result.hostToken}`);
    } catch (error) {
      handleServiceError(error, socket, 'room-error');
    }
  });

  // Join room
  socket.on('join-room', async data => {
    console.log(
      `🔐 Join request: roomId=${data?.roomId}, userName=${data?.userName}, hostToken=${data?.hostToken ? 'PROVIDED' : 'MISSING'}, socketId=${socket.id}`
    );

    // Check if this socket is already in this room
    if (data?.roomId && socket.rooms.has(data.roomId)) {
      console.log(`🔄 Socket ${socket.id} already in room ${data.roomId}, checking if this is a known user...`);
      const room = await RoomService.getRoom(data.roomId);
      if (room) {
        const existingUser = room.users.find(u => u.name === data?.userName?.trim());
        if (existingUser) {
          const isValidHost = existingUser.isHost && data?.hostToken === room.hostToken;
          if (isValidHost || !existingUser.isHost) {
            console.log(`✅ User ${data.userName} already in room, emitting join success`);
            socket.emit('room-joined', { room, user: existingUser });
            emitVoiceParticipantCountToSocket(data.roomId);
            return;
          }
        }
      }
      console.log(`🔄 Ignoring duplicate join attempt for unknown user`);
      return;
    }

    try {
      const validatedData = validateData(JoinRoomDataSchema, data, socket);
      if (!validatedData) return;

      const result = await RoomService.joinRoom(
        {
          roomId: validatedData.roomId,
          userName: validatedData.userName,
          hostToken: validatedData.hostToken,
        },
        { userId: socket.data.userId || '' }
      );

      // Set socket data
      socket.data.userId = result.user.id;
      socket.data.userName = result.user.name;
      socket.data.roomId = result.room.id;

      // Join socket room
      await socket.join(result.room.id);

      // Store user-socket mapping
      await redisService.userMapping.setUserSocket(result.user.id, socket.id);

      // Emit events
      socket.emit('room-joined', { room: result.room, user: result.user });

      if (result.isNewUser) {
        socket.to(result.room.id).emit('user-joined', { user: result.user });
        emitSystemMessage(io, result.room.id, `${result.user.name} joined the room`, 'join', {
          userId: result.user.id,
          userName: result.user.name,
        });
      }

      emitVoiceParticipantCountToSocket(result.room.id);
      console.log(`${result.user.name} joined room ${result.room.id} as ${result.user.isHost ? 'host' : 'guest'}`);
    } catch (error) {
      if (error instanceof PasscodeRequiredError) {
        socket.emit('passcode-required', { roomId: error.roomId });
        return;
      }
      handleServiceError(error, socket, 'room-error');
    }
  });

  // Leave room
  socket.on('leave-room', async data => {
    const validatedData = validateData(RoomActionDataSchema, data, socket);
    if (!validatedData) return;

    await handleLeaveRoom(socket, validatedData.roomId, true, io);
  });

  // Promote user to host
  socket.on('promote-host', async ({ roomId, userId }) => {
    try {
      const ctx = createSocketContext(socket.data);
      if (!ctx) {
        socket.emit('error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      const result = await RoomService.promoteUser({ roomId, targetUserId: userId }, ctx);

      io.to(roomId).emit('user-promoted', { userId, userName: result.targetUser.name });
      emitSystemMessage(io, roomId, `${result.targetUser.name} was promoted to host`, 'promote', {
        userId,
        userName: result.targetUser.name,
      });
    } catch (error) {
      handleServiceError(error, socket);
    }
  });

  // Kick user
  socket.on('kick-user', async data => {
    try {
      const validatedData = validateData(KickUserDataSchema, data, socket);
      if (!validatedData) return;

      const ctx = createSocketContext(socket.data);
      if (!ctx) {
        socket.emit('error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      const result = await RoomService.kickUser(
        { roomId: validatedData.roomId, targetUserId: validatedData.userId },
        ctx
      );

      const kickPayload = {
        userId: validatedData.userId,
        userName: result.targetUser.name,
        kickedBy: ctx.userId,
      };

      // Handle the kicked user's socket
      if (result.targetSocketId) {
        const targetSocket = io.sockets.sockets.get(result.targetSocketId);
        if (targetSocket) {
          // IMPORTANT: Emit user-kicked to target BEFORE they leave the room
          // This ensures they receive the event and can redirect
          targetSocket.emit('user-kicked', kickPayload);

          // Remove from video chat room if joined
          const videoChatRoom = `videochat:${validatedData.roomId}`;
          if (targetSocket.rooms.has(videoChatRoom)) {
            targetSocket.to(videoChatRoom).emit('videochat-peer-left', { userId: validatedData.userId });
            await targetSocket.leave(videoChatRoom);
          }

          // Remove from voice room if joined
          const voiceRoom = `voice:${validatedData.roomId}`;
          if (targetSocket.rooms.has(voiceRoom)) {
            targetSocket.to(voiceRoom).emit('voice-peer-left', { userId: validatedData.userId });
            await targetSocket.leave(voiceRoom);
          }

          // Remove from main room AFTER emitting user-kicked
          await targetSocket.leave(validatedData.roomId);
        }
      }

      // Notify remaining users in the room
      io.to(validatedData.roomId).emit('user-kicked', kickPayload);
      emitSystemMessage(io, validatedData.roomId, `${result.targetUser.name} was kicked from the room`, 'kick', {
        userId: validatedData.userId,
        userName: result.targetUser.name,
        kickedBy: ctx.userId,
      });
    } catch (error) {
      handleServiceError(error, socket);
    }
  });

  // Verify passcode and join
  socket.on('verify-passcode', async data => {
    try {
      const validatedData = validateData(VerifyPasscodeDataSchema, data, socket);
      if (!validatedData) return;

      const result = await RoomService.verifyPasscode(
        {
          roomId: validatedData.roomId,
          userName: validatedData.userName,
          passcode: validatedData.passcode,
          hostToken: validatedData.hostToken,
        },
        { userId: socket.data.userId || '' }
      );

      // Set socket data
      socket.data.userId = result.user.id;
      socket.data.userName = result.user.name;
      socket.data.roomId = result.room.id;

      // Join socket room
      await socket.join(result.room.id);

      // Store user-socket mapping
      await redisService.userMapping.setUserSocket(result.user.id, socket.id);

      // Emit events
      socket.emit('room-joined', { room: result.room, user: result.user });

      if (result.isNewUser) {
        socket.to(result.room.id).emit('user-joined', { user: result.user });
        emitSystemMessage(io, result.room.id, `${result.user.name} joined the room`, 'join', {
          userId: result.user.id,
          userName: result.user.name,
        });
      }

      emitVoiceParticipantCountToSocket(result.room.id);
      console.log(`${result.user.name} joined room ${result.room.id} after passcode verification`);
    } catch (error) {
      handleServiceError(error, socket, 'room-error');
    }
  });

  // Update room settings
  socket.on('update-room-settings', async data => {
    try {
      const validatedData = validateData(UpdateRoomSettingsDataSchema, data, socket);
      if (!validatedData) return;

      const ctx = createSocketContext(socket.data);
      if (!ctx) {
        socket.emit('error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      const result = await RoomService.updateSettings(
        { roomId: validatedData.roomId, settings: validatedData.settings },
        ctx
      );

      io.to(validatedData.roomId).emit('room-settings-updated', { settings: result.settings });
    } catch (error) {
      handleServiceError(error, socket);
    }
  });
}

// Leave room helper (also used by disconnect handler)
export async function handleLeaveRoom(
  socket: Socket<SocketEvents, SocketEvents, object, SocketData>,
  roomId: string,
  isManualLeave: boolean = false,
  io: IOServer
) {
  try {
    const ctx = createSocketContext(socket.data);
    if (!ctx) return;

    const result = await RoomService.leaveRoom({ roomId }, ctx);
    if (!result) return;

    if (result.roomClosed) {
      // Notify remaining users the room is closing
      socket.to(roomId).emit('room-error', {
        error: "Looks like all the hosts have left, so this room is closing. We're sending you back home.",
      });
    } else {
      // Notify remaining users
      socket.to(roomId).emit('user-left', { userId: ctx.userId });
      if (isManualLeave) {
        emitSystemMessage(io, roomId, `${result.leavingUser.name} left the room`, 'leave', {
          userId: ctx.userId,
          userName: result.leavingUser.name,
        });
      }
    }

    // Leave voice room if joined
    const voiceRoom = `voice:${roomId}`;
    if (socket.rooms.has(voiceRoom)) {
      socket.to(voiceRoom).emit('voice-peer-left', { userId: ctx.userId });
      await socket.leave(voiceRoom);
      console.log(`Voice: ${ctx.userName || 'User'} left ${voiceRoom}`);
    }

    // Leave main room
    await socket.leave(roomId);

    // Clean up user mapping
    await redisService.userMapping.removeUserSocket(ctx.userId);

    console.log(`${ctx.userName || 'User'} left room ${roomId}`);
  } catch (error) {
    console.error('Error leaving room:', error);
  }
}
