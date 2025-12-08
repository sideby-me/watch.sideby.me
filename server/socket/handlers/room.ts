import { Socket, Server as IOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { redisService } from '@/server/redis';
import { generateRoomId } from '@/lib/video-utils';
import {
  Room,
  User,
  CreateRoomDataSchema,
  JoinRoomDataSchema,
  RoomActionDataSchema,
  KickUserDataSchema,
} from '@/types';
import { SocketEvents, SocketData } from '../types';
import { validateData, emitSystemMessage } from '../utils';

export function registerRoomHandlers(socket: Socket<SocketEvents, SocketEvents, object, SocketData>, io: IOServer) {
  // Voice participant count helpers (so late joiners immediately see current voice occupancy)
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

      const { hostName } = validatedData;
      const roomId = generateRoomId();
      const userId = uuidv4();

      const user: User = {
        id: userId,
        name: hostName,
        isHost: true,
        joinedAt: new Date(),
      };

      const room: Room = {
        id: roomId,
        hostId: userId,
        hostName: hostName,
        hostToken: uuidv4(),
        videoType: null,
        videoState: {
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          lastUpdateTime: Date.now(),
        },
        users: [user],
        createdAt: new Date(),
      };

      await redisService.rooms.createRoom(room);

      socket.data.userId = userId;
      socket.data.userName = hostName;
      socket.data.roomId = roomId;

      await socket.join(roomId);

      // Store userId -> socketId mapping in Redis for efficient lookup
      await redisService.userMapping.setUserSocket(userId, socket.id);

      socket.emit('room-created', { roomId, room, hostToken: room.hostToken });
      socket.emit('room-joined', { room, user });
      emitVoiceParticipantCountToSocket(roomId);
      console.log(`Room ${roomId} created by ${hostName} with token ${room.hostToken}`);
    } catch (error) {
      console.error('Error creating room:', error);
      socket.emit('room-error', { error: 'Failed to create room' });
    }
  });

  // Join room
  socket.on('join-room', async data => {
    console.log(
      `🔐 Join request: roomId=${data?.roomId}, userName=${data?.userName}, hostToken=${data?.hostToken ? 'PROVIDED' : 'MISSING'}, socketId=${socket.id}`
    );

    // Check if this exact socket is already in this room
    if (data?.roomId && socket.rooms.has(data.roomId)) {
      console.log(`🔄 Socket ${socket.id} already in room ${data.roomId}, checking if this is the room creator...`);

      const room = await redisService.rooms.getRoom(data.roomId);
      if (room) {
        const existingUser = room.users.find(u => u.name === data?.userName?.trim());

        if (existingUser) {
          if (existingUser.isHost && data?.hostToken === room.hostToken) {
            console.log(`✅ Room creator ${data.userName} already in room, emitting join success`);
            socket.emit('room-joined', { room, user: existingUser });
            emitVoiceParticipantCountToSocket(data.roomId);
            return;
          }

          if (!existingUser.isHost) {
            console.log(`✅ Guest ${data.userName} already in room, emitting join success`);
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

      const { roomId, userName, hostToken } = validatedData;
      const room = await redisService.rooms.getRoom(roomId);
      if (!room) {
        socket.emit('room-error', { error: 'Room not found' });
        return;
      }

      // Check if this user is already in the room (by name)
      const existingUser = room.users.find(u => u.name === userName);
      if (existingUser) {
        if (existingUser.isHost) {
          if (!hostToken || hostToken !== room.hostToken) {
            console.log(`Host impersonation attempt by ${userName} - existing user but invalid token`);
            socket.emit('room-error', {
              error: `We don't allow copycats. Please choose a different callsign.`,
            });
            return;
          }
          console.log(`Host ${userName} verified with valid token (existing user)`);

          socket.data.userId = existingUser.id;
          socket.data.userName = existingUser.name;
          socket.data.roomId = roomId;

          await socket.join(roomId);

          // Store userId -> socketId mapping in Redis for efficient lookup
          await redisService.userMapping.setUserSocket(existingUser.id, socket.id);
          console.log(`${userName} rejoined room ${roomId} (existing user, isHost: ${existingUser.isHost})`);
          socket.emit('room-joined', { room, user: existingUser });
          emitVoiceParticipantCountToSocket(roomId);
          return;
        } else {
          console.log(`Duplicate name attempt by ${userName} - name already taken by guest`);
          socket.emit('room-error', {
            error: `Looks like the name "${userName}" is already in use here. Could you pick another one?`,
          });
          return;
        }
      }

      // Check if this user is trying to be the host
      const isClaimingHost = room.hostName === userName;
      let isRoomHost = false;

      console.log(
        `Join attempt: user="${userName}", isClaimingHost=${isClaimingHost}, hostToken="${hostToken}", roomHostToken="${room.hostToken}"`
      );

      if (isClaimingHost) {
        if (hostToken && hostToken === room.hostToken) {
          isRoomHost = true;
          console.log(`Host ${userName} verified with valid token`);
        } else {
          console.log(`Host impersonation attempt by ${userName} - invalid or missing token`);
          socket.emit('room-error', {
            error: `We don't allow copycats. Please choose a different callsign.`,
          });
          return;
        }
      } else {
        if (room.hostName === userName) {
          console.log(`Guest attempting to use host name: ${userName}`);
          socket.emit('room-error', {
            error: `We don't allow copycats. Please choose a different callsign.`,
          });
          return;
        }
      }

      // Create new user
      const userId = uuidv4();
      const user: User = {
        id: userId,
        name: userName,
        isHost: isRoomHost,
        joinedAt: new Date(),
      };

      // If this is the host rejoining, update the room's hostId
      if (isRoomHost) {
        room.hostId = userId;
        await redisService.rooms.updateRoom(roomId, room);
        console.log(`Host ${userName} rejoining room ${roomId} with new user ID`);
      }

      await redisService.rooms.addUserToRoom(roomId, user);
      const updatedRoom = await redisService.rooms.getRoom(roomId);

      socket.data.userId = userId;
      socket.data.userName = userName;
      socket.data.roomId = roomId;

      await socket.join(roomId);

      // Store userId -> socketId mapping in Redis for efficient lookup
      await redisService.userMapping.setUserSocket(userId, socket.id);

      socket.emit('room-joined', { room: updatedRoom!, user });
      socket.to(roomId).emit('user-joined', { user });
      emitVoiceParticipantCountToSocket(roomId);
      emitSystemMessage(io, roomId, `${user.name} joined the room`, 'join', { userId, userName: user.name });

      console.log(`${user.name} joined room ${roomId} as ${isRoomHost ? 'host' : 'guest'}`);
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('room-error', { error: 'Failed to join room' });
    }
  });

  // Leave room
  socket.on('leave-room', async data => {
    const validatedData = validateData(RoomActionDataSchema, data, socket);
    if (!validatedData) return;

    const { roomId } = validatedData;
    await handleLeaveRoom(socket, roomId, true, io);
  });

  // Promote user to host
  socket.on('promote-host', async ({ roomId, userId }) => {
    try {
      if (!socket.data.userId) {
        socket.emit('error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      const room = await redisService.rooms.getRoom(roomId);
      if (!room) {
        socket.emit('room-error', { error: 'Room not found' });
        return;
      }

      const currentUser = room.users.find(u => u.id === socket.data.userId);
      if (!currentUser?.isHost) {
        socket.emit('error', { error: 'Only hosts can promote users' });
        return;
      }

      const targetUser = room.users.find(u => u.id === userId);
      if (!targetUser) {
        socket.emit('error', { error: 'User not found' });
        return;
      }

      if (targetUser.isHost) {
        socket.emit('error', { error: 'Looks like that user is already a host!' });
        return;
      }

      // Update user to host
      const updatedUsers = room.users.map(u => (u.id === userId ? { ...u, isHost: true } : u));
      const updatedRoom = { ...room, users: updatedUsers };
      await redisService.rooms.updateRoom(roomId, updatedRoom);

      io.to(roomId).emit('user-promoted', { userId, userName: targetUser.name });
      emitSystemMessage(io, roomId, `${targetUser.name} was promoted to host`, 'promote', {
        userId,
        userName: targetUser.name,
      });

      console.log(`${targetUser.name} promoted to host in room ${roomId} by ${currentUser.name}`);
    } catch (error) {
      console.error('Error promoting user:', error);
      socket.emit('error', { error: 'Failed to promote user' });
    }
  });

  // Kick user
  socket.on('kick-user', async data => {
    try {
      const validatedData = validateData(KickUserDataSchema, data, socket);
      if (!validatedData) return;

      const { roomId, userId } = validatedData;

      if (!socket.data.userId) {
        socket.emit('error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      const room = await redisService.rooms.getRoom(roomId);
      if (!room) {
        socket.emit('room-error', { error: 'Room not found' });
        return;
      }

      const currentUser = room.users.find(u => u.id === socket.data.userId);
      if (!currentUser?.isHost) {
        socket.emit('error', { error: 'Only hosts can kick users' });
        return;
      }

      const targetUser = room.users.find(u => u.id === userId);
      if (!targetUser) {
        socket.emit('error', { error: 'User not found' });
        return;
      }

      if (targetUser.isHost) {
        socket.emit('error', { error: "Whoa there! You can't kick another host. That's just not cool." });
        return;
      }

      if (targetUser.id === currentUser.id) {
        socket.emit('error', { error: "As much as you might want to, you can't kick yourself from the room." });
        return;
      }

      // Get the target user's socket ID from Redis
      const targetSocketId = await redisService.userMapping.getUserSocket(userId);

      // Remove user from room first
      const updatedUsers = room.users.filter(u => u.id !== userId);
      const updatedRoom = { ...room, users: updatedUsers };
      await redisService.rooms.updateRoom(roomId, updatedRoom);

      // Remove the kicked user from Socket.IO room and notify them
      if (targetSocketId) {
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          // Remove them from voice room if joined
          const voiceRoom = `voice:${roomId}`;
          if (targetSocket.rooms.has(voiceRoom)) {
            targetSocket.to(voiceRoom).emit('voice-peer-left', { userId });
            await targetSocket.leave(voiceRoom);
          }

          // Remove from main room FIRST
          await targetSocket.leave(roomId);

          // Then notify them they were kicked
          targetSocket.emit('room-error', {
            error: `Awkward... ${currentUser.name} just kicked you out.`,
          });
        }

        // Remove userId -> socketId mapping from Redis
        await redisService.userMapping.removeUserSocket(userId);
      }

      // Send to all users in the room (including the host who initiated the kick)
      io.to(roomId).emit('user-kicked', {
        userId,
        userName: targetUser.name,
        kickedBy: currentUser.id,
      });
      emitSystemMessage(io, roomId, `${targetUser.name} was kicked from the room`, 'kick', {
        userId,
        userName: targetUser.name,
        kickedBy: currentUser.id,
      });

      console.log(`${targetUser.name} was kicked from room ${roomId} by ${currentUser.name}`);
    } catch (error) {
      console.error('Error kicking user:', error);
      socket.emit('error', { error: 'Failed to kick user' });
    }
  });
}

export async function handleLeaveRoom(
  socket: Socket<SocketEvents, SocketEvents, object, SocketData>,
  roomId: string,
  isManualLeave: boolean = false,
  io: IOServer
) {
  try {
    if (!socket.data.userId) return;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) return;

    const leavingUser = room.users.find(u => u.id === socket.data.userId);
    if (!leavingUser) return;

    // Remove the leaving user from the room
    const updatedUsers = room.users.filter(u => u.id !== socket.data.userId);

    // Check if any hosts remain after this user leaves
    const remainingHosts = updatedUsers.filter(u => u.isHost);

    if (leavingUser.isHost && remainingHosts.length === 0) {
      // Last host is leaving, close the entire room and kick everyone out
      console.log(
        `🚪 Last host ${isManualLeave ? 'manually left' : 'disconnected from'} room ${roomId}, closing room and kicking all users`
      );

      // Notify all remaining users that the room is being closed
      socket.to(roomId).emit('room-error', {
        error: "Looks like all the hosts have left, so this room is closing. We're sending you back home.",
      });

      // Delete the room entirely
      await redisService.rooms.deleteRoom(roomId);

      console.log(`Room ${roomId} has been closed`);
    } else {
      // Update room with remaining users
      if (updatedUsers.length === 0) {
        // No users left at all, delete the room
        await redisService.rooms.deleteRoom(roomId);
      } else {
        // Update room with remaining users
        const updatedRoom = { ...room, users: updatedUsers };
        await redisService.rooms.updateRoom(roomId, updatedRoom);

        // Notify remaining users that this user left
        socket.to(roomId).emit('user-left', { userId: socket.data.userId });
        if (leavingUser && isManualLeave) {
          if (isManualLeave) {
            emitSystemMessage(io, roomId, `${leavingUser.name} left the room`, 'leave', {
              userId: socket.data.userId,
              userName: leavingUser.name,
            });
          }
        }
      }
    }

    // Also leave voice room if joined and notify peers
    const voiceRoom = `voice:${roomId}`;
    if (socket.rooms.has(voiceRoom)) {
      socket.to(voiceRoom).emit('voice-peer-left', { userId: socket.data.userId });
      await socket.leave(voiceRoom);
      console.log(`Voice: ${socket.data.userName || 'User'} left ${voiceRoom}`);
    }

    await socket.leave(roomId);

    // Remove userId -> socketId mapping from Redis
    await redisService.userMapping.removeUserSocket(socket.data.userId);

    console.log(`${socket.data.userName || 'User'} left room ${roomId}`);
  } catch (error) {
    console.error('Error leaving room:', error);
  }
}
