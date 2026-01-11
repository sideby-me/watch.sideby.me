import { Room, User, VideoState, VideoMeta } from '@/types';
import { redis } from '../client';

export class RoomRepository {
  private static instance: RoomRepository;

  static getInstance(): RoomRepository {
    if (!RoomRepository.instance) {
      RoomRepository.instance = new RoomRepository();
    }
    return RoomRepository.instance;
  }

  async createRoom(room: Room): Promise<void> {
    await redis.setex(`room:${room.id}`, 86400, JSON.stringify(room)); // 24 hours TTL
    await redis.sadd('active-rooms', room.id);
  }

  async getRoom(roomId: string): Promise<Room | null> {
    const roomData = await redis.get(`room:${roomId}`);
    if (!roomData) return null;

    const room = JSON.parse(roomData) as Room;
    // Convert date strings back to Date objects
    room.createdAt = new Date(room.createdAt);
    room.users = room.users.map(user => ({
      ...user,
      joinedAt: new Date(user.joinedAt),
    }));

    return room;
  }

  async updateRoom(roomId: string, room: Room): Promise<void> {
    await redis.setex(`room:${roomId}`, 86400, JSON.stringify(room));
  }

  async deleteRoom(roomId: string): Promise<void> {
    await redis.del(`room:${roomId}`);
    await redis.srem('active-rooms', roomId);
  }

  async roomExists(roomId: string): Promise<boolean> {
    return (await redis.exists(`room:${roomId}`)) === 1;
  }

  async addUserToRoom(roomId: string, user: User): Promise<void> {
    const room = await this.getRoom(roomId);
    if (!room) throw new Error('Room not found');

    // Remove user if already exists (rejoin case)
    room.users = room.users.filter(u => u.id !== user.id);
    room.users.push(user);

    await this.updateRoom(roomId, room);
  }

  async removeUserFromRoom(roomId: string, userId: string): Promise<void> {
    const room = await this.getRoom(roomId);
    if (!room) return;

    room.users = room.users.filter(u => u.id !== userId);

    // If no users left, delete the room
    if (room.users.length === 0) {
      await this.deleteRoom(roomId);
    } else {
      // If host left, assign new host
      if (room.hostId === userId && room.users.length > 0) {
        const newHost = room.users[0];
        room.hostId = newHost.id;
        room.hostName = newHost.name;
        newHost.isHost = true;
      }
      await this.updateRoom(roomId, room);
    }
  }

  async updateVideoState(roomId: string, videoState: VideoState): Promise<void> {
    const room = await this.getRoom(roomId);
    if (!room) throw new Error('Room not found');

    room.videoState = videoState;
    await this.updateRoom(roomId, room);
  }

  async setVideoUrl(
    roomId: string,
    videoUrl: string,
    videoType: 'youtube' | 'mp4' | 'm3u8',
    videoMeta?: VideoMeta
  ): Promise<void> {
    const room = await this.getRoom(roomId);
    if (!room) throw new Error('Room not found');

    room.videoUrl = videoUrl;
    room.videoType = videoType;
    if (videoMeta) {
      room.videoMeta = videoMeta;
    }
    // Reset video state when new video is set
    room.videoState = {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      lastUpdateTime: Date.now(),
    };

    await this.updateRoom(roomId, room);
  }

  async cleanup(): Promise<void> {
    // This method can be called periodically to clean up expired rooms
    const activeRooms = await redis.smembers('active-rooms');

    for (const roomId of activeRooms) {
      const exists = await redis.exists(`room:${roomId}`);
      if (!exists) {
        await redis.srem('active-rooms', roomId);
      }
    }
  }
}
