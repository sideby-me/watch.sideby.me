import { redisService } from '@/server/redis';
import { resolveSource } from '@/server/video/resolve-source';
import { buildProxyUrl, isProxiedUrl } from '@/lib/video-proxy-client';
import { VIDEO_SYNC_DEBOUNCE_MS, VIDEO_ERROR_REPORT_DEBOUNCE_MS } from '@/lib/constants';
import { logEvent } from '@/server/logger';
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

    let legacyVideoType: 'youtube' | 'mp4' | 'm3u8' = 'mp4';
    if (meta.videoType === 'youtube') legacyVideoType = 'youtube';
    else if (meta.videoType === 'm3u8') legacyVideoType = 'm3u8';

    await redisService.rooms.setVideoUrl(roomId, meta.playbackUrl, legacyVideoType, meta);

    logEvent({
      level: 'info',
      domain: 'video',
      event: 'video_set',
      message: `video.set: new source queued up (${meta.deliveryType})`,
      roomId,
      meta: { originalUrl: videoUrl, playbackUrl: meta.playbackUrl, deliveryType: meta.deliveryType },
    });

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

    logEvent({
      level: 'info',
      domain: 'video',
      event: 'sync_check',
      message: `video.sync: host nudged everyone to ${currentTime.toFixed(1)}s`,
      roomId,
      meta: { currentTime, isPlaying },
    });

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
      logEvent({
        level: 'warn',
        domain: 'video',
        event: 'proxy_fallback',
        message: 'video.fallback: forced proxy after client error',
        roomId,
        meta: { code, proxyUrl },
      });

      return {
        fallbackApplied: true,
        newPlaybackUrl: proxyUrl,
        videoType: legacyVideoType,
        videoMeta: fallbackMeta,
      };
    }

    logEvent({
      level: 'warn',
      domain: 'video',
      event: 'late_error',
      message: 'video.error: late failure reported by client',
      roomId,
      meta: { code, message },
    });

    // Re-resolve using originalUrl
    const meta = await resolveSource(originalUrl);
    if (meta.playbackUrl !== videoMeta.playbackUrl) {
      let resolvedVideoType: 'youtube' | 'mp4' | 'm3u8' = 'mp4';
      if (meta.videoType === 'youtube') resolvedVideoType = 'youtube';
      else if (meta.videoType === 'm3u8') resolvedVideoType = 'm3u8';

      await redisService.rooms.setVideoUrl(roomId, meta.playbackUrl, resolvedVideoType, meta);
      logEvent({
        level: 'info',
        domain: 'video',
        event: 're_resolved',
        message: `video.resolve: re-resolved source -> ${meta.deliveryType}`,
        roomId,
        meta: { playbackUrl: meta.playbackUrl, deliveryType: meta.deliveryType },
      });

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
