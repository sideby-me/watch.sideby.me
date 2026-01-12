import { v4 as uuidv4 } from 'uuid';
import { redisService } from '@/server/redis';
import { generateRoomId } from '@/src/lib/video-utils';
import { logEvent } from '@/server/logger';
import type { Room, User, RoomSettings } from '@/types';
import type { SocketContext } from './SocketContext';
import { NotFoundError, PermissionError, ConflictError, RoomLockedError, PasscodeRequiredError } from '../errors';

// Request Types (wrapping existing DTOs where applicable)

export interface CreateRoomRequest {
  hostName: string;
}

export interface JoinRoomRequest {
  roomId: string;
  userName: string;
  hostToken?: string;
}

export interface VerifyPasscodeRequest {
  roomId: string;
  userName: string;
  passcode: string;
  hostToken?: string;
}

export interface LeaveRoomRequest {
  roomId: string;
}

export interface PromoteUserRequest {
  roomId: string;
  targetUserId: string;
}

export interface KickUserRequest {
  roomId: string;
  targetUserId: string;
}

export interface UpdateSettingsRequest {
  roomId: string;
  settings: Partial<RoomSettings>;
}

// Result Types

export interface CreateRoomResult {
  room: Room;
  user: User;
  hostToken: string;
}

export interface JoinRoomResult {
  room: Room;
  user: User;
  isNewUser: boolean;
}

export interface LeaveRoomResult {
  leavingUser: User;
  roomClosed: boolean;
  remainingUsers: User[];
}

export interface PromoteUserResult {
  targetUser: User;
}

export interface KickUserResult {
  targetUser: User;
  targetSocketId: string | null;
}

export interface UpdateSettingsResult {
  settings: RoomSettings;
}

// RoomService
class RoomServiceImpl {
  // Create a new room with the given host name.
  async createRoom(request: CreateRoomRequest): Promise<CreateRoomResult> {
    const { hostName } = request;
    const roomId = generateRoomId();
    const userId = uuidv4();
    const hostToken = uuidv4();

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
      hostToken: hostToken,
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

    logEvent({
      level: 'info',
      domain: 'room',
      event: 'room_created',
      message: `room.create: ${hostName} spun up a new room`,
      roomId,
      userId,
    });

    return { room, user, hostToken };
  }

  // Join an existing room.
  // Throws PasscodeRequiredError if room requires passcode.
  // Throws RoomLockedError if room is locked.
  async joinRoom(request: JoinRoomRequest, _ctx: SocketContext): Promise<JoinRoomResult> {
    const { roomId, userName, hostToken } = request;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      throw new NotFoundError("Hmm, we couldn't find a room with that code. Maybe a typo?");
    }

    const isHostWithToken = hostToken && hostToken === room.hostToken;

    // Check room lock (only affects non-host tokens)
    if (room.settings?.isLocked && !isHostWithToken) {
      throw new RoomLockedError();
    }

    // Check passcode requirement (only affects non-host tokens)
    if (room.settings?.passcode && !isHostWithToken) {
      throw new PasscodeRequiredError(roomId);
    }

    // Check if user already exists in room
    const existingUser = room.users.find(u => u.name === userName);
    if (existingUser) {
      return this.handleExistingUser(room, existingUser, userName, hostToken);
    }

    // Check for host name impersonation
    if (room.hostName === userName && !isHostWithToken) {
      throw new ConflictError("We don't allow copycats. Please choose a different callsign.");
    }

    // Create new user
    return this.createNewUser(room, userName, hostToken);
  }

  // Verify passcode and join room.
  async verifyPasscode(request: VerifyPasscodeRequest, _ctx: SocketContext): Promise<JoinRoomResult> {
    const { roomId, userName, passcode, hostToken } = request;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      throw new NotFoundError("Hmm, we couldn't find a room with that code. Maybe a typo?");
    }

    // Verify passcode
    if (room.settings?.passcode !== passcode) {
      throw new PermissionError('Incorrect passcode. Please try again.');
    }

    const isHostWithToken = hostToken && hostToken === room.hostToken;

    // Check if room became locked while entering passcode
    if (room.settings?.isLocked && !isHostWithToken) {
      throw new RoomLockedError();
    }

    // Check if user already exists
    const existingUser = room.users.find(u => u.name === userName);
    if (existingUser) {
      return this.handleExistingUser(room, existingUser, userName, hostToken);
    }

    // Create new user
    return this.createNewUser(room, userName, hostToken);
  }

  // Leave a room.
  async leaveRoom(request: LeaveRoomRequest, ctx: SocketContext): Promise<LeaveRoomResult | null> {
    const { roomId } = request;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) return null;

    const leavingUser = room.users.find(u => u.id === ctx.userId);
    if (!leavingUser) return null;

    // Remove the leaving user
    const updatedUsers = room.users.filter(u => u.id !== ctx.userId);

    // Check if any hosts remain
    const remainingHosts = updatedUsers.filter(u => u.isHost);
    const isLastHost = leavingUser.isHost && remainingHosts.length === 0;

    if (isLastHost || updatedUsers.length === 0) {
      // Last host leaving or no users left - close room
      await redisService.rooms.deleteRoom(roomId);
      logEvent({
        level: 'info',
        domain: 'room',
        event: 'room_closed',
        message: 'room.close: last host left, lights out',
        roomId,
        userId: ctx.userId,
      });

      return {
        leavingUser,
        roomClosed: true,
        remainingUsers: [],
      };
    }

    // Update room with remaining users
    const updatedRoom = { ...room, users: updatedUsers };
    await redisService.rooms.updateRoom(roomId, updatedRoom);

    logEvent({
      level: 'info',
      domain: 'room',
      event: 'user_left',
      message: `room.leave: ${leavingUser.name} waved goodbye`,
      roomId,
      userId: leavingUser.id,
    });

    return {
      leavingUser,
      roomClosed: false,
      remainingUsers: updatedUsers,
    };
  }

  // Promote a user to host.
  async promoteUser(request: PromoteUserRequest, ctx: SocketContext): Promise<PromoteUserResult> {
    const { roomId, targetUserId } = request;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      throw new NotFoundError("Hmm, we couldn't find a room with that code.");
    }

    // Check if requester is a host
    const currentUser = room.users.find(u => u.id === ctx.userId);
    if (!currentUser?.isHost) {
      throw new PermissionError('Only hosts can promote users');
    }

    // Find target user
    const targetUser = room.users.find(u => u.id === targetUserId);
    if (!targetUser) {
      throw new NotFoundError('User not found');
    }

    if (targetUser.isHost) {
      throw new ConflictError('Looks like that user is already a host!');
    }

    // Update user to host
    const updatedUsers = room.users.map(u => (u.id === targetUserId ? { ...u, isHost: true } : u));
    const updatedRoom = { ...room, users: updatedUsers };
    await redisService.rooms.updateRoom(roomId, updatedRoom);

    logEvent({
      level: 'info',
      domain: 'room',
      event: 'user_promoted',
      message: `room.promote: ${targetUser.name} got the remote`,
      roomId,
      userId: targetUser.id,
      meta: { promotedBy: currentUser.name },
    });

    return { targetUser: { ...targetUser, isHost: true } };
  }

  // Kick a user from the room.
  async kickUser(request: KickUserRequest, ctx: SocketContext): Promise<KickUserResult> {
    const { roomId, targetUserId } = request;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      throw new NotFoundError("Hmm, we couldn't find a room with that code.");
    }

    // Check if requester is a host
    const currentUser = room.users.find(u => u.id === ctx.userId);
    if (!currentUser?.isHost) {
      throw new PermissionError('Only hosts can kick users');
    }

    // Find target user
    const targetUser = room.users.find(u => u.id === targetUserId);
    if (!targetUser) {
      throw new NotFoundError('User not found');
    }

    if (targetUser.isHost) {
      throw new PermissionError("Whoa there! You can't kick another host. That's just not cool.");
    }

    if (targetUser.id === ctx.userId) {
      throw new PermissionError("As much as you might want to, you can't kick yourself from the room.");
    }

    // Get target socket ID before removal
    const targetSocketId = await redisService.userMapping.getUserSocket(targetUserId);

    // Remove user from room
    const updatedUsers = room.users.filter(u => u.id !== targetUserId);
    const updatedRoom = { ...room, users: updatedUsers };
    await redisService.rooms.updateRoom(roomId, updatedRoom);

    // Clean up user mapping
    await redisService.userMapping.removeUserSocket(targetUserId);

    logEvent({
      level: 'info',
      domain: 'room',
      event: 'user_kicked',
      message: `room.kick: ${targetUser.name} shown the door`,
      roomId,
      userId: targetUser.id,
      meta: { kickedBy: currentUser.name },
    });

    return { targetUser, targetSocketId };
  }

  // Update room settings.
  async updateSettings(request: UpdateSettingsRequest, ctx: SocketContext): Promise<UpdateSettingsResult> {
    const { roomId, settings } = request;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      throw new NotFoundError("Hmm, we couldn't find a room with that code.");
    }

    // Check if requester is a host
    const currentUser = room.users.find(u => u.id === ctx.userId);
    if (!currentUser?.isHost) {
      throw new PermissionError('Only hosts can update room settings');
    }

    // Merge settings
    const currentSettings = room.settings || { isLocked: false, passcode: null, isChatLocked: false };
    const updatedSettings: RoomSettings = {
      isLocked: settings.isLocked ?? currentSettings.isLocked,
      passcode: settings.passcode !== undefined ? settings.passcode : currentSettings.passcode,
      isChatLocked: settings.isChatLocked ?? currentSettings.isChatLocked,
    };

    const updatedRoom = { ...room, settings: updatedSettings };
    await redisService.rooms.updateRoom(roomId, updatedRoom);

    logEvent({
      level: 'info',
      domain: 'room',
      event: 'settings_updated',
      message: `room.settings: ${currentUser.name} tweaked the dials`,
      roomId,
      userId: currentUser.id,
      meta: { settings: updatedSettings },
    });

    return { settings: updatedSettings };
  }

  // Get a room by ID.
  async getRoom(roomId: string): Promise<Room | null> {
    return redisService.rooms.getRoom(roomId);
  }

  // Private helpers

  private async handleExistingUser(
    room: Room,
    existingUser: User,
    userName: string,
    hostToken?: string
  ): Promise<JoinRoomResult> {
    if (existingUser.isHost) {
      // Host trying to rejoin - verify token
      if (!hostToken || hostToken !== room.hostToken) {
        throw new ConflictError("We don't allow copycats. Please choose a different callsign.");
      }
      logEvent({
        level: 'info',
        domain: 'room',
        event: 'host_rejoined',
        message: `room.rejoin: host ${userName} is back`,
        roomId: room.id,
        userId: existingUser.id,
      });
      return { room, user: existingUser, isNewUser: false };
    } else {
      // Guest name collision
      throw new ConflictError(`Looks like the name "${userName}" is already in use here. Could you pick another one?`);
    }
  }

  private async createNewUser(room: Room, userName: string, hostToken?: string): Promise<JoinRoomResult> {
    const isRoomHost = room.hostName === userName && hostToken === room.hostToken;
    const userId = uuidv4();

    const user: User = {
      id: userId,
      name: userName,
      isHost: isRoomHost,
      joinedAt: new Date(),
    };

    // If this is the host rejoining with new ID, update hostId
    if (isRoomHost) {
      room.hostId = userId;
      await redisService.rooms.updateRoom(room.id, room);
      logEvent({
        level: 'info',
        domain: 'room',
        event: 'host_rejoined',
        message: `room.rejoin: host ${userName} is back with a fresh ID`,
        roomId: room.id,
        userId,
      });
    }

    await redisService.rooms.addUserToRoom(room.id, user);
    const updatedRoom = await redisService.rooms.getRoom(room.id);

    logEvent({
      level: 'info',
      domain: 'room',
      event: 'user_joined',
      message: `room.join: ${userName} hopped in as ${isRoomHost ? 'host' : 'guest'}`,
      roomId: room.id,
      userId,
    });

    return { room: updatedRoom!, user, isNewUser: true };
  }
}

// Export singleton instance
export const RoomService = new RoomServiceImpl();
