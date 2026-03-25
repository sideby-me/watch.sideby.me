// Auto-refresh daemon for Lens-captured video sources
import type { Server } from 'socket.io';
import { Redis } from 'ioredis';
import { dispatch } from './dispatch';
import { logEvent } from '@/server/logger';
import { redisService } from '@/server/redis';
import type { VideoMeta } from '@/types';

const REFRESH_INTERVAL_MS = 60_000;
// Evaluate these dynamically inside tick() that runs after Next.js initialization
const LOCK_TTL_S = 120;

export class LensRefreshDaemon {
  private interval: ReturnType<typeof setInterval> | null = null;
  private redis: Redis;
  private io: Server;

  constructor(io: Server, redis: Redis) {
    this.io = io;
    this.redis = redis;
  }

  start(): void {
    if (this.interval) return;
    logEvent({ level: 'info', domain: 'video', event: 'refresh_daemon_start', message: 'Lens refresh daemon started' });
    this.interval = setInterval(() => this.tick(), REFRESH_INTERVAL_MS);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async tick(): Promise<void> {
    const refreshBufferMs = Number(process.env.LENS_REFRESH_BUFFER_MS ?? 300_000);

    try {
      const rooms = await redisService.rooms.getRoomsWithExpiringPayloads(refreshBufferMs);

      for (const room of rooms) {
        if (!room.videoMeta?.originalUrl || !room.videoMeta?.expiresAt) continue;
        if (room.videoMeta.expiresAt > Date.now() + refreshBufferMs) continue;

        // Acquire distributed lock
        const lockKey = `lens:refresh-lock:${room.id}`;
        const acquired = await this.redis.set(lockKey, '1', 'EX', LOCK_TTL_S, 'NX');
        if (!acquired) continue; // Another process is already refreshing

        try {
          logEvent({
            level: 'info',
            domain: 'video',
            event: 'refresh_dispatch',
            message: `Refreshing video for room ${room.id}`,
            meta: { roomId: room.id, originalUrl: room.videoMeta.originalUrl },
          });

          // Re-dispatch without socket (no status relay for background refresh)
          // Prefer userSelectedUrl as dispatch target when present
          const userSelectedUrl = room.videoMeta.userSelectedUrl;
          const targetUrl = userSelectedUrl ?? room.videoMeta.originalUrl;

          let result: Awaited<ReturnType<typeof dispatch>>;
          let usedUserSelected = false;

          try {
            result = await dispatch(targetUrl);
            usedUserSelected = !!userSelectedUrl;
          } catch (dispatchErr) {
            if (userSelectedUrl) {
              // userSelectedUrl is unavailable
              logEvent({
                level: 'info',
                domain: 'video',
                event: 'refresh_fallback',
                message: `userSelectedUrl dispatch failed, falling back to originalUrl`,
                meta: { roomId: room.id, reason: 'userSelectedUrl_unavailable' },
              });
              // Clear userSelectedUrl from VideoMeta in Redis
              const currentRoom = await redisService.rooms.getRoom(room.id);
              if (currentRoom?.videoMeta) {
                const clearedMeta: VideoMeta = { ...currentRoom.videoMeta, userSelectedUrl: undefined };
                await redisService.rooms.setVideoUrl(
                  room.id,
                  currentRoom.videoUrl ?? currentRoom.videoMeta.playbackUrl,
                  currentRoom.videoType ?? 'm3u8',
                  clearedMeta
                );
              }
              // Fall back to full scoring pass
              result = await dispatch(room.videoMeta.originalUrl);
              usedUserSelected = false;
            } else {
              throw dispatchErr;
            }
          }

          // Build updated VideoMeta - use fresh expiresAt from dispatch result only, so stale expiresAt cannot re-trigger the daemon on the next tick
          const updatedMeta: VideoMeta = {
            ...room.videoMeta,
            playbackUrl: result.playbackUrl,
            lensUuid: result.lensUuid,
            expiresAt: result.expiresAt, // always the fresh value, undefined if non-Lens dispatch
            timestamp: Date.now(),
            // Preserve userSelectedUrl if dispatch succeeded on that URL
            ...(usedUserSelected
              ? { userSelectedUrl: room.videoMeta.userSelectedUrl }
              : { userSelectedUrl: undefined }),
          };

          await redisService.rooms.setVideoUrl(room.id, result.playbackUrl, result.videoType, updatedMeta);

          // Emit to room clients
          this.io.to(room.id).emit('video-url-refresh', {
            videoUrl: result.playbackUrl,
            videoType: result.videoType,
            videoMeta: updatedMeta,
          });

          logEvent({
            level: 'info',
            domain: 'video',
            event: 'refresh_success',
            message: `Refreshed video for room ${room.id}`,
            meta: { roomId: room.id, newUuid: result.lensUuid },
          });
        } catch (err) {
          logEvent({
            level: 'error',
            domain: 'video',
            event: 'refresh_failed',
            message: `Failed to refresh video for room ${room.id}`,
            meta: { roomId: room.id, error: String(err) },
          });
        }
      }
    } catch (err) {
      logEvent({
        level: 'error',
        domain: 'video',
        event: 'refresh_tick_error',
        message: 'Refresh daemon tick failed',
        meta: { error: String(err) },
      });
    }
  }
}
