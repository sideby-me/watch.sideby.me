import { Server as IOServer, Socket } from 'socket.io';
import { redisService } from '@/server/redis';
import { VIDEO_CHAT_MAX_PARTICIPANTS } from '@/lib/constants';
import type { SocketContext } from './SocketContext';
import { NotFoundError, PermissionError, CapacityError } from '../errors';
import type { SocketEvents, SocketData } from '../socket/types';

// Request Types
export interface VideoChatJoinRequest {
  roomId: string;
}

export interface VideoChatLeaveRequest {
  roomId: string;
}

class VideoChatServiceImpl {
  // Check if user can join video chat
  async canJoinVideoChat(request: VideoChatJoinRequest, ctx: SocketContext): Promise<void> {
    const { roomId } = request;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      throw new NotFoundError("We couldn't find that room.");
    }

    // Check if chat is locked for non-hosts
    if (room.settings?.isChatLocked) {
      const user = room.users.find(u => u.id === ctx.userId);
      if (!user?.isHost) {
        throw new PermissionError('Video chat is currently locked. Only hosts can join.');
      }
    }
  }

  // Check participant capacity.
  checkCapacity(currentCount: number): void {
    if (currentCount >= VIDEO_CHAT_MAX_PARTICIPANTS) {
      throw new CapacityError(
        `Whoa, it's a full house! The video channel is at its max of ${VIDEO_CHAT_MAX_PARTICIPANTS} people, unless Hulk's in the room.`
      );
    }
  }

  // Compute valid video chat participants from Socket.IO adapter.
  computeValidParticipants(
    io: IOServer,
    roomId: string
  ): { sockets: Socket<SocketEvents, SocketEvents, object, SocketData>[]; staleSocketIds: string[] } {
    const vcRoomKey = `videochat:${roomId}`;
    const rawIds = Array.from(io.sockets.adapter.rooms.get(vcRoomKey) || new Set<string>());
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

  // Clean up stale sockets from video chat room.
  async cleanupStaleSockets(io: IOServer, roomId: string, staleSocketIds: string[]): Promise<void> {
    const vcRoomKey = `videochat:${roomId}`;
    for (const sid of staleSocketIds) {
      const s = io.sockets.sockets.get(sid);
      try {
        if (s) s.leave(vcRoomKey);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  // Find a socket by user ID using Redis mapping.
  async findSocketByUserId(
    io: IOServer,
    userId: string
  ): Promise<Socket<SocketEvents, SocketEvents, object, SocketData> | undefined> {
    try {
      const socketId = await redisService.userMapping.getUserSocket(userId);
      if (!socketId) return undefined;

      const socket = io.sockets.sockets.get(socketId) as
        | Socket<SocketEvents, SocketEvents, object, SocketData>
        | undefined;

      if (socket && socket.data.userId === userId) {
        return socket;
      }

      if (!socket || socket.data.userId !== userId) {
        await redisService.userMapping.removeUserSocket(userId);
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  // Get the max participants constant.
  getMaxParticipants(): number {
    return VIDEO_CHAT_MAX_PARTICIPANTS;
  }
}

// Export singleton instance
export const VideoChatService = new VideoChatServiceImpl();
