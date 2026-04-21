import { Socket, Server as IOServer } from 'socket.io';
import {
  SetVideoDataSchema,
  VideoControlDataSchema,
  SyncCheckDataSchema,
  TimePingDataSchema,
  PickerSelectDataSchema,
} from '@/types';
import { SocketEvents, SocketData } from '../types';
import { validateData, emitSystemMessage } from '../utils';
import { handleServiceError } from '../error-handler';
import { VideoService, createSocketContext } from '@/server/services';
import { logEvent } from '@/server/logger';
import { redisService } from '@/server/redis';
import type { PickerState } from '@/server/redis/handlers/picker';
import { dispatch, type DispatchLogContext } from '@/server/video/dispatch';
import { randomUUID } from 'crypto';
import { trace } from '@opentelemetry/api';

const LENS_PICKER_TIMEOUT_MS = Number(process.env.LENS_PICKER_TIMEOUT_MS ?? 60_000);

function randomHexId(bytes: number): string {
  return randomUUID()
    .replace(/-/g, '')
    .slice(0, bytes * 2);
}

export function createSetVideoCorrelation(socketData: SocketData): DispatchLogContext {
  const activeSpan = trace.getActiveSpan();
  const spanContext = activeSpan?.spanContext();

  return {
    requestId: socketData.requestId ?? randomUUID(),
    dispatchId: randomUUID(),
    traceId: spanContext?.traceId ?? socketData.traceId ?? randomHexId(16),
    spanId: spanContext?.spanId ?? socketData.spanId ?? randomHexId(8),
    roomId: socketData.roomId ?? undefined,
    userId: socketData.userId ?? undefined,
  };
}

export function registerVideoHandlers(socket: Socket<SocketEvents, SocketEvents, object, SocketData>, io: IOServer) {
  // Set video URL
  socket.on('set-video', async data => {
    try {
      const validatedData = validateData(SetVideoDataSchema, data, socket);
      if (!validatedData) return;

      const ctx = createSocketContext(socket.data);
      if (!ctx) {
        socket.emit('error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      const correlation = createSetVideoCorrelation(socket.data);
      if (validatedData.pageUrl) correlation.pageUrl = validatedData.pageUrl;
      const missingCorrelationKeys = [
        !correlation.roomId ? 'room_id' : null,
        !correlation.userId ? 'user_id' : null,
      ].filter(Boolean);

      if (missingCorrelationKeys.length > 0) {
        logEvent({
          level: 'warn',
          domain: 'video',
          event: 'socket_entry_missing_non_core_ids',
          message: 'Socket set-video entry missing non-core correlation IDs',
          requestId: correlation.requestId,
          dispatchId: correlation.dispatchId,
          traceId: correlation.traceId,
          spanId: correlation.spanId,
          roomId: correlation.roomId,
          userId: correlation.userId,
          meta: { missingCorrelationKeys },
        });
      }

      const result = await VideoService.setVideo(
        { roomId: validatedData.roomId, videoUrl: validatedData.videoUrl },
        ctx,
        socket,
        correlation
      );

      if (result.pickerRequired && result.pickerCandidates && result.pickerReason) {
        const roomId = validatedData.roomId;
        const expiresAt = Date.now() + LENS_PICKER_TIMEOUT_MS;
        const pickerState: PickerState = {
          candidates: result.pickerCandidates,
          winnerPlaybackUrl: result.playbackUrl,
          expiresAt,
          reason: result.pickerReason,
          createdAt: Date.now(),
        };

        await redisService.picker.setPickerState(roomId, pickerState);

        socket.emit('picker-required', {
          roomId,
          candidates: result.pickerCandidates,
          winnerPlaybackUrl: result.playbackUrl,
          expiresAt,
          reason: result.pickerReason,
        });

        logEvent({
          level: 'info',
          domain: 'video',
          event: 'picker-required-emitted',
          message: `Picker required: waiting for host selection (${result.pickerReason})`,
          roomId,
          meta: { candidateCount: result.pickerCandidates.length, reason: result.pickerReason, expiresAt },
        });

        // Auto-select timeout
        const timeoutHandle = setTimeout(async () => {
          const stored = await redisService.picker.getPickerState(roomId);
          if (!stored) return; // Already resolved by host selection

          await redisService.picker.deletePickerState(roomId);

          logEvent({
            level: 'info',
            domain: 'video',
            event: 'picker-timeout-auto-select',
            message: `Picker timeout: auto-selected winner after 60s`,
            roomId,
            meta: {
              winnerUrl: stored.winnerPlaybackUrl,
              expiresAt: stored.expiresAt,
              reason: stored.reason,
            },
          });

          io.to(roomId).emit('video-set', {
            videoUrl: result.playbackUrl,
            videoType: result.videoType,
            videoMeta: result.videoMeta,
          });
          emitSystemMessage(io, roomId, 'Video source changed', 'video-change', {
            videoUrl: result.playbackUrl,
          });
        }, LENS_PICKER_TIMEOUT_MS);

        // Clean up timeout handle if socket disconnects before timer fires
        socket.once('disconnect', () => clearTimeout(timeoutHandle));
      } else {
        // Non-ambiguous capture: emit video-set immediately
        io.to(validatedData.roomId).emit('video-set', {
          videoUrl: result.playbackUrl,
          videoType: result.videoType,
          videoMeta: result.videoMeta,
        });
        emitSystemMessage(io, validatedData.roomId, 'Video source changed', 'video-change', {
          videoUrl: result.playbackUrl,
        });
      }
    } catch (error) {
      const errMsg = (error as Error)?.message ?? '';
      const message =
        errMsg === 'Unsupported protocol'
          ? 'Only http/https video links are supported'
          : errMsg.startsWith('DRM-protected content')
            ? errMsg
            : errMsg.includes('no-media-found')
              ? "We couldn't find a playable stream on that page."
              : undefined;
      if (message) {
        socket.emit('error', { error: message });
      } else {
        handleServiceError(error, socket);
      }
    }
  });

  // Play video
  socket.on('play-video', async data => {
    try {
      const validatedData = validateData(VideoControlDataSchema, data, socket);
      if (!validatedData) return;

      const ctx = createSocketContext(socket.data);
      if (!ctx) {
        socket.emit('error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      const result = await VideoService.playVideo(
        { roomId: validatedData.roomId, currentTime: validatedData.currentTime },
        ctx
      );

      // Broadcast play event immediately based on computed state.
      socket.to(validatedData.roomId).emit('video-played', {
        currentTime: result.videoState.currentTime,
        timestamp: result.videoState.lastUpdateTime,
      });

      // Emit system message without an extra Redis hop.
      if (result.shouldEmitSystemMessage && socket.data.userName) {
        emitSystemMessage(io, validatedData.roomId, 'Video resumed', 'play', { userName: socket.data.userName });
      }
    } catch (error) {
      handleServiceError(error, socket);
    }
  });

  // Pause video
  socket.on('pause-video', async data => {
    try {
      const validatedData = validateData(VideoControlDataSchema, data, socket);
      if (!validatedData) return;

      const ctx = createSocketContext(socket.data);
      if (!ctx) {
        socket.emit('error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      const result = await VideoService.pauseVideo(
        { roomId: validatedData.roomId, currentTime: validatedData.currentTime },
        ctx
      );

      socket.to(validatedData.roomId).emit('video-paused', {
        currentTime: result.videoState.currentTime,
        timestamp: result.videoState.lastUpdateTime,
      });

      if (result.shouldEmitSystemMessage) {
        if (socket.data.userName) {
          emitSystemMessage(io, validatedData.roomId, 'Video paused', 'pause', { userName: socket.data.userName });
        }
      }
    } catch (error) {
      handleServiceError(error, socket);
    }
  });

  // Seek video
  socket.on('seek-video', async data => {
    try {
      const validatedData = validateData(VideoControlDataSchema, data, socket);
      if (!validatedData) return;

      const ctx = createSocketContext(socket.data);
      if (!ctx) {
        socket.emit('error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      const result = await VideoService.seekVideo(
        { roomId: validatedData.roomId, currentTime: validatedData.currentTime },
        ctx
      );

      socket.to(validatedData.roomId).emit('video-seeked', {
        currentTime: result.videoState.currentTime,
        timestamp: result.videoState.lastUpdateTime,
      });
    } catch (error) {
      handleServiceError(error, socket);
    }
  });

  // Sync check (host broadcasts to guests)
  socket.on('sync-check', data => {
    const validatedData = validateData(SyncCheckDataSchema, data, socket);
    if (!validatedData) return;
    if (!socket.data.isHost) return;
    if (validatedData.roomId !== socket.data.roomId) return;

    socket.to(validatedData.roomId).emit('sync-update', {
      currentTime: validatedData.currentTime,
      isPlaying: validatedData.isPlaying,
      timestamp: validatedData.timestamp,
    });
  });

  // NTP-style clock sync
  socket.on('time-ping', data => {
    const validated = validateData(TimePingDataSchema, data, socket);
    if (!validated) return;
    socket.emit('time-pong', { clientSendTime: validated.clientSendTime, serverTime: Date.now() });
  });

  // Video error report (client reports playback failure)
  socket.on(
    'video-error-report',
    async ({ roomId, code, message, currentSrc, currentTime, isHost, codecUnparsable }) => {
      logEvent({
        level: 'warn',
        domain: 'video',
        event: 'error_report_received',
        message: 'video.error: client reported playback error',
        roomId,
        meta: { code, message, currentSrc, currentTime, isHost, codecUnparsable },
      });
    }
  );

  // Host-triggered manual URL refresh
  socket.on('video-url-refresh', async () => {
    try {
      if (!socket.data.isHost || !socket.data.roomId) return;
      const roomId = socket.data.roomId;

      const ctx = createSocketContext(socket.data);
      if (!ctx) return;

      const room = await (await import('@/server/redis')).redisService.rooms.getRoom(roomId);
      if (!room?.videoMeta?.originalUrl) return;

      const result = await VideoService.setVideo({ roomId, videoUrl: room.videoMeta.originalUrl }, ctx, socket);

      io.to(roomId).emit('video-url-refresh', {
        videoUrl: result.playbackUrl,
        videoType: result.videoType,
        videoMeta: result.videoMeta,
      });
    } catch (error) {
      handleServiceError(error, socket);
    }
  });

  // Re-emit picker-required to reconnecting host if picker state is still active
  socket.on('join-room', async () => {
    if (!socket.data.isHost || !socket.data.roomId) return;

    const roomId = socket.data.roomId;
    try {
      const stored = await redisService.picker.getPickerState(roomId);
      if (!stored) return;
      socket.emit('picker-required', {
        roomId,
        candidates: stored.candidates,
        winnerPlaybackUrl: stored.winnerPlaybackUrl,
        expiresAt: stored.expiresAt,
        reason: stored.reason,
      });
      logEvent({
        level: 'info',
        domain: 'video',
        event: 'picker-reconnect-reemit',
        message: `Re-emitted picker-required to reconnecting host`,
        roomId,
        meta: { expiresAt: stored.expiresAt },
      });
    } catch (err) {
      logEvent({
        level: 'warn',
        domain: 'video',
        event: 'picker-reconnect-error',
        message: `Failed to check picker state on reconnect`,
        roomId,
        meta: { error: String(err) },
      });
    }
  });

  // Host selects a candidate from the picker overlay
  socket.on('picker-select', async data => {
    try {
      const validatedData = validateData(PickerSelectDataSchema, data, socket);
      if (!validatedData) return;

      if (!socket.data.isHost || socket.data.roomId !== validatedData.roomId) {
        socket.emit('error', { error: 'Only the host can make a picker selection' });
        return;
      }

      const roomId = validatedData.roomId;
      const stored = await redisService.picker.getPickerState(roomId);

      if (!stored) {
        // State expired or was already consumed
        socket.emit('error', { error: 'Picker session expired. The video was auto-selected.' });
        return;
      }

      const candidateUrls = stored.candidates.map(c => c.mediaUrl);
      if (!candidateUrls.includes(validatedData.selectedUrl)) {
        logEvent({
          level: 'warn',
          domain: 'video',
          event: 'picker-invalid-selection',
          message: `Host selected URL not in candidate list`,
          roomId,
          meta: { selectedUrl: validatedData.selectedUrl, candidateUrls },
        });
        socket.emit('error', { error: 'Selection not recognized. Please try again.' });
        return;
      }

      // Delete picker state first (consumed)
      await redisService.picker.deletePickerState(roomId);

      logEvent({
        level: 'info',
        domain: 'video',
        event: 'picker-state-cleanup',
        message: `Removed picker state from Redis`,
        roomId,
        meta: { reason: 'host-selection', duration_ms: Date.now() - stored.createdAt },
      });

      const isWinnerSelection = validatedData.selectedUrl === stored.winnerPlaybackUrl;

      if (isWinnerSelection) {
        // Winner selection: emit video-set with winner URL, no userSelectedUrl
        const room = await redisService.rooms.getRoom(roomId);
        const videoMeta = room?.videoMeta;

        io.to(roomId).emit('video-set', {
          videoUrl: stored.winnerPlaybackUrl,
          videoType: 'm3u8' as const,
          videoMeta: videoMeta ?? undefined,
        });
        emitSystemMessage(io, roomId, 'Video source changed', 'video-change', {
          videoUrl: stored.winnerPlaybackUrl,
        });
      } else {
        // Alternative selection: dispatch the selected URL, store userSelectedUrl in VideoMeta
        const result = await dispatch(validatedData.selectedUrl, socket);

        const room = await redisService.rooms.getRoom(roomId);
        const updatedMeta: import('@/types').VideoMeta = {
          ...(room?.videoMeta ?? {
            originalUrl: validatedData.selectedUrl,
            playbackUrl: result.playbackUrl,
            deliveryType: result.deliveryType,
            videoType: result.videoType,
            requiresProxy: result.deliveryType !== 'youtube',
            decisionReasons: [`dispatch:${result.deliveryType}`],
            probe: { status: 200 },
            timestamp: Date.now(),
          }),
          playbackUrl: result.playbackUrl,
          deliveryType: result.deliveryType,
          videoType: result.videoType,
          lensUuid: result.lensUuid,
          expiresAt: result.expiresAt,
          timestamp: Date.now(),
          userSelectedUrl: validatedData.selectedUrl,
        };

        await redisService.rooms.setVideoUrl(roomId, result.playbackUrl, result.videoType, updatedMeta);

        io.to(roomId).emit('video-set', {
          videoUrl: result.playbackUrl,
          videoType: result.videoType,
          videoMeta: updatedMeta,
        });
        emitSystemMessage(io, roomId, 'Video source changed', 'video-change', {
          videoUrl: result.playbackUrl,
        });
      }
    } catch (error) {
      handleServiceError(error, socket);
    }
  });
}
