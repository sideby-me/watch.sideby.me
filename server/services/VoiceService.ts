import { Server as IOServer, Socket } from 'socket.io';
import { redisService } from '@/server/redis';
import { VOICE_MAX_PARTICIPANTS } from '@/src/lib/constants';
import { logEvent } from '@/server/logger';
import type { SocketContext } from './SocketContext';
import { NotFoundError, PermissionError, CapacityError } from '../errors';
import type { SocketEvents, SocketData } from '../socket/types';

export interface VoiceJoinRequest {
  roomId: string;
}

export interface VoiceLeaveRequest {
  roomId: string;
}

export interface VoiceJoinResult {
  existingPeerUserIds: string[];
  participantCount: number;
}

export interface VoiceLeaveResult {
  participantCount: number;
}

class VoiceServiceImpl {
  // Check if user can join voice chat.
  async canJoinVoice(request: VoiceJoinRequest, ctx: SocketContext): Promise<void> {
    const { roomId } = request;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      throw new NotFoundError("Hmm, we couldn't find a room with that code. Maybe a typo?");
    }

    // Check if chat is locked for non-hosts
    if (room.settings?.isChatLocked) {
      const user = room.users.find(u => u.id === ctx.userId);
      if (!user?.isHost) {
        throw new PermissionError('Voice chat is currently locked. Only hosts can join.');
      }
    }
  }

  // Check participant capacity.
  checkCapacity(currentCount: number): void {
    if (currentCount >= VOICE_MAX_PARTICIPANTS) {
      throw new CapacityError(
        `Whoa, it's a full house! The voice channel is at its max of ${VOICE_MAX_PARTICIPANTS} people, unless Hulk's in the room.`
      );
    }
  }

  // Compute valid voice participants from Socket.IO adapter.
  computeValidParticipants(
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

  // Clean up stale sockets from voice room.
  async cleanupStaleSockets(io: IOServer, roomId: string, staleSocketIds: string[]): Promise<void> {
    const voiceRoomKey = `voice:${roomId}`;
    for (const sid of staleSocketIds) {
      const s = io.sockets.sockets.get(sid);
      try {
        if (s) s.leave(voiceRoomKey);
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

      // Verify socket still exists and has correct userId
      if (socket && socket.data.userId === userId) {
        return socket;
      }

      // Clean up stale mapping
      if (!socket || socket.data.userId !== userId) {
        await redisService.userMapping.removeUserSocket(userId);
      }

      return undefined;
    } catch (error) {
      logEvent({
        level: 'error',
        domain: 'voice',
        event: 'socket_lookup_error',
        message: 'voice.error: failed to find socket by userId',
        meta: { error: String(error), userId },
      });
      return undefined;
    }
  }

  // Get the max participants constant.
  getMaxParticipants(): number {
    return VOICE_MAX_PARTICIPANTS;
  }
}

// Export singleton instance
export const VoiceService = new VoiceServiceImpl();
