import { redisService } from '@/server/redis';
import { resolveSource } from '@/server/video/resolve-source';
import { buildProxyUrl, isProxiedUrl } from '@/lib/video-proxy-client';
import { VIDEO_SYNC_DEBOUNCE_MS, VIDEO_ERROR_REPORT_DEBOUNCE_MS } from '@/lib/constants';
import type { VideoState, VideoMeta } from '@/types';
import type { SocketContext } from './SocketContext';
import { NotFoundError, PermissionError } from '../errors';

export interface SetVideoRequest {
  roomId: string;
  videoUrl: string;
}

export interface VideoControlRequest {
  roomId: string;
  currentTime: number;
}

export interface SyncCheckRequest {
  roomId: string;
  currentTime: number;
  isPlaying: boolean;
  timestamp: number;
}

export interface VideoErrorReportRequest {
  roomId: string;
  code?: number;
  message?: string;
  currentSrc: string;
  currentTime?: number;
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

export interface SyncCheckResult {
  currentTime: number;
  isPlaying: boolean;
  timestamp: number;
}

export interface VideoErrorReportResult {
  fallbackApplied: boolean;
  newPlaybackUrl?: string;
  videoType?: 'youtube' | 'mp4' | 'm3u8';
  videoMeta?: VideoMeta;
}

// VideoService
class VideoServiceImpl {
  // Debounce maps (per room)
  private lastPlayEmitTime: Record<string, number> = {};
  private lastPauseEmitTime: Record<string, number> = {};
  private lastErrorReport: Record<string, number> = {};

  // Set video URL for a room.
  async setVideo(request: SetVideoRequest, ctx: SocketContext): Promise<SetVideoResult> {
    const { roomId, videoUrl } = request;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      throw new NotFoundError("Hmm, we couldn't find a room with that code. Maybe a typo?");
    }

    const currentUser = room.users.find(u => u.id === ctx.userId);
    if (!currentUser?.isHost) {
      throw new PermissionError('Only hosts can set the video');
    }

    // Resolve source centrally
    const meta = await resolveSource(videoUrl);

    // Bridge pattern: VideoMeta provides rich delivery semantics (direct, file-proxy, hls, youtube),
    // but client player components only need to know which player to render: 'youtube' | 'mp4' | 'm3u8'.
    // This mapping converts VideoMeta.videoType to the simplified player-selection format.
    // See: VideoPlayerContainer.tsx, use-video-sync.ts, RoomShell.getActivePlayer()
    let legacyVideoType: 'youtube' | 'mp4' | 'm3u8' = 'mp4';
    if (meta.videoType === 'youtube') legacyVideoType = 'youtube';
    else if (meta.videoType === 'm3u8') legacyVideoType = 'm3u8';

    await redisService.rooms.setVideoUrl(roomId, meta.playbackUrl, legacyVideoType, meta);

    console.log(`Video set in room ${roomId}: ${videoUrl} -> playback: ${meta.playbackUrl} (${meta.deliveryType})`);

    return {
      playbackUrl: meta.playbackUrl,
      videoType: legacyVideoType,
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

    console.log(`Video played in room ${roomId} at ${currentTime}s`);

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

    console.log(`Video paused in room ${roomId} at ${currentTime}s`);

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

    console.log(`Video seeked in room ${roomId} to ${currentTime}s`);

    return { videoState, shouldEmitSystemMessage: false };
  }

  // Handle sync check from host.
  async handleSyncCheck(request: SyncCheckRequest, ctx: SocketContext): Promise<SyncCheckResult> {
    const { roomId, currentTime, isPlaying, timestamp } = request;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      throw new NotFoundError("Hmm, we couldn't find a room with that code. Maybe a typo?");
    }

    const currentUser = room.users.find(u => u.id === ctx.userId);
    if (!currentUser?.isHost) {
      throw new PermissionError('Only hosts can send sync checks');
    }

    console.log(`Sync check sent in room ${roomId}: ${currentTime.toFixed(2)}s, playing: ${isPlaying}`);

    return { currentTime, isPlaying, timestamp };
  }

  /**
   * Handle video error report from client. Uses two-tier fallback:
   * 1. Proxy fallback: If not already proxying, wrap originalUrl in proxy (handles 403/CORS)
   * 2. Re-resolve fallback: If proxy won't help or already proxied, re-resolve originalUrl
   *    (handles expired URLs or changed CDN endpoints)
   */
  async handleErrorReport(request: VideoErrorReportRequest): Promise<VideoErrorReportResult> {
    const { roomId, code, message, currentSrc } = request;

    // Debounce rapid error reports
    const now = Date.now();
    if (this.lastErrorReport[roomId] && now - this.lastErrorReport[roomId] < VIDEO_ERROR_REPORT_DEBOUNCE_MS) {
      return { fallbackApplied: false };
    }
    this.lastErrorReport[roomId] = now;

    const room = await redisService.rooms.getRoom(roomId);
    if (!room) {
      return { fallbackApplied: false };
    }

    const videoMeta = room.videoMeta;
    if (!videoMeta) {
      return { fallbackApplied: false };
    }

    // Ignore if already proxying or report src doesn't match current playback
    if (videoMeta.requiresProxy) {
      return { fallbackApplied: false };
    }
    if (currentSrc && currentSrc !== videoMeta.playbackUrl) {
      return { fallbackApplied: false };
    }

    const originalUrl = videoMeta.originalUrl || currentSrc;
    if (!originalUrl) {
      return { fallbackApplied: false };
    }

    let legacyVideoType: 'youtube' | 'mp4' | 'm3u8' = 'mp4';
    if (videoMeta.videoType === 'youtube') legacyVideoType = 'youtube';
    else if (videoMeta.videoType === 'm3u8') legacyVideoType = 'm3u8';

    const proxyDisallowed = legacyVideoType === 'youtube' || videoMeta.decisionReasons?.includes('direct-required-cdn');

    // Force proxy fallback if possible
    if (!proxyDisallowed && !isProxiedUrl(videoMeta.playbackUrl)) {
      const proxyUrl = buildProxyUrl(originalUrl);
      const fallbackMeta: VideoMeta = {
        ...videoMeta,
        playbackUrl: proxyUrl,
        deliveryType: legacyVideoType === 'm3u8' ? 'hls' : 'file-proxy',
        requiresProxy: true,
        decisionReasons: [...(videoMeta.decisionReasons || []), 'client-error-fallback'],
        timestamp: Date.now(),
      };

      await redisService.rooms.setVideoUrl(roomId, proxyUrl, legacyVideoType, fallbackMeta);
      console.log(`Forced proxy fallback for room ${roomId} after client error (code ${code})`);

      return {
        fallbackApplied: true,
        newPlaybackUrl: proxyUrl,
        videoType: legacyVideoType,
        videoMeta: fallbackMeta,
      };
    }

    console.log(`Late video error reported in room ${roomId}: code=${code} msg=${message}`);

    // Re-resolve using originalUrl
    const meta = await resolveSource(originalUrl);
    if (meta.playbackUrl !== videoMeta.playbackUrl) {
      let resolvedVideoType: 'youtube' | 'mp4' | 'm3u8' = 'mp4';
      if (meta.videoType === 'youtube') resolvedVideoType = 'youtube';
      else if (meta.videoType === 'm3u8') resolvedVideoType = 'm3u8';

      await redisService.rooms.setVideoUrl(roomId, meta.playbackUrl, resolvedVideoType, meta);
      console.log(`Re-resolved video source for room ${roomId} -> ${meta.deliveryType}`);

      return {
        fallbackApplied: true,
        newPlaybackUrl: meta.playbackUrl,
        videoType: resolvedVideoType,
        videoMeta: meta,
      };
    }

    return { fallbackApplied: false };
  }
}

// Export singleton instance
export const VideoService = new VideoServiceImpl();
