import { redisService } from '@/server/redis';
import { dispatch } from '@/server/video/dispatch';
import { VIDEO_SYNC_DEBOUNCE_MS } from '@/src/lib/constants';
import { logEvent } from '@/server/logger';
import type { VideoState, VideoMeta } from '@/types';
import type { SocketContext } from './SocketContext';
import { NotFoundError, PermissionError } from '../errors';
import type { Socket } from 'socket.io';

export interface SetVideoRequest {
  roomId: string;
  videoUrl: string;
}

export interface VideoControlRequest {
  roomId: string;
  currentTime: number;
}

export interface SetVideoResult {
  playbackUrl: string;
  videoType: 'youtube' | 'mp4' | 'm3u8';
  videoMeta: VideoMeta;
}

export interface VideoControlResult {
  videoState: VideoState;
  shouldEmitSystemMessage: boolean;
}

// VideoService
class VideoServiceImpl {
  // Debounce maps (per room)
  private lastPlayEmitTime: Record<string, number> = {};
  private lastPauseEmitTime: Record<string, number> = {};

  // Set video URL for a room.
  async setVideo(request: SetVideoRequest, ctx: SocketContext, socket?: Socket): Promise<SetVideoResult> {
    const { roomId, videoUrl } = request;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      throw new NotFoundError("Hmm, we couldn't find a room with that code. Maybe a typo?");
    }

    const currentUser = room.users.find(u => u.id === ctx.userId);
    if (!currentUser?.isHost) {
      throw new PermissionError('Only hosts can set the video');
    }

    // 6-tier dispatch (replaces resolveSource)
    const result = await dispatch(videoUrl, socket);

    // Build VideoMeta from dispatch result
    const meta: VideoMeta = {
      originalUrl: result.originalUrl,
      playbackUrl: result.playbackUrl,
      deliveryType: result.deliveryType,
      videoType: result.videoType,
      requiresProxy: result.deliveryType !== 'youtube',
      decisionReasons: [`dispatch:${result.deliveryType}`],
      probe: { status: 200 },
      timestamp: Date.now(),
      ...(result.lensUuid ? { lensUuid: result.lensUuid } : {}),
      ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}),
    };

    await redisService.rooms.setVideoUrl(roomId, result.playbackUrl, result.videoType, meta);

    logEvent({
      level: 'info',
      domain: 'video',
      event: 'video_set',
      message: `video.set: new source queued up (${result.deliveryType})`,
      roomId,
      meta: { deliveryType: result.deliveryType, lensUuid: result.lensUuid },
    });

    return {
      playbackUrl: result.playbackUrl,
      videoType: result.videoType,
      videoMeta: meta,
    };
  }

  // Play video.
  async playVideo(request: VideoControlRequest, ctx: SocketContext): Promise<VideoControlResult> {
    const { roomId, currentTime } = request;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      throw new NotFoundError("Hmm, we couldn't find a room with that code. Maybe a typo?");
    }

    const currentUser = room.users.find(u => u.id === ctx.userId);
    if (!currentUser?.isHost) {
      throw new PermissionError('Only hosts can control the video');
    }

    // Check if we should emit system message (debounced)
    const now = Date.now();
    const lastEmit = this.lastPlayEmitTime[roomId] || 0;
    const shouldEmitSystemMessage = !room.videoState.isPlaying && now - lastEmit > VIDEO_SYNC_DEBOUNCE_MS;

    if (shouldEmitSystemMessage) {
      this.lastPlayEmitTime[roomId] = now;
    }

    const videoState: VideoState = {
      isPlaying: true,
      currentTime,
      duration: room.videoState.duration,
      lastUpdateTime: now,
    };

    await redisService.rooms.updateVideoState(roomId, videoState);

    logEvent({
      level: 'info',
      domain: 'video',
      event: 'video_play',
      message: `video.play: rolling at ${currentTime.toFixed(1)}s`,
      roomId,
    });

    return { videoState, shouldEmitSystemMessage };
  }

  // Pause video.
  async pauseVideo(request: VideoControlRequest, ctx: SocketContext): Promise<VideoControlResult> {
    const { roomId, currentTime } = request;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      throw new NotFoundError("Hmm, we couldn't find a room with that code. Maybe a typo?");
    }

    const currentUser = room.users.find(u => u.id === ctx.userId);
    if (!currentUser?.isHost) {
      throw new PermissionError('Only hosts can control the video');
    }

    const now = Date.now();
    const lastEmit = this.lastPauseEmitTime[roomId] || 0;
    const shouldEmitSystemMessage = now - lastEmit > VIDEO_SYNC_DEBOUNCE_MS;

    if (shouldEmitSystemMessage) {
      this.lastPauseEmitTime[roomId] = now;
    }

    const videoState: VideoState = {
      isPlaying: false,
      currentTime,
      duration: room.videoState.duration,
      lastUpdateTime: now,
    };

    await redisService.rooms.updateVideoState(roomId, videoState);

    logEvent({
      level: 'info',
      domain: 'video',
      event: 'video_pause',
      message: `video.pause: holding at ${currentTime.toFixed(1)}s`,
      roomId,
    });

    return { videoState, shouldEmitSystemMessage };
  }

  // Seek video.
  async seekVideo(request: VideoControlRequest, ctx: SocketContext): Promise<VideoControlResult> {
    const { roomId, currentTime } = request;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      throw new NotFoundError("Hmm, we couldn't find a room with that code. Maybe a typo?");
    }

    const currentUser = room.users.find(u => u.id === ctx.userId);
    if (!currentUser?.isHost) {
      throw new PermissionError('Only hosts can control the video');
    }

    const videoState: VideoState = {
      ...room.videoState,
      currentTime,
      lastUpdateTime: Date.now(),
    };

    await redisService.rooms.updateVideoState(roomId, videoState);

    logEvent({
      level: 'info',
      domain: 'video',
      event: 'video_seek',
      message: `video.seek: jumped to ${currentTime.toFixed(1)}s`,
      roomId,
    });

    return { videoState, shouldEmitSystemMessage: false };
  }
}

// Export singleton instance
export const VideoService = new VideoServiceImpl();
