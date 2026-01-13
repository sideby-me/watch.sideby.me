import { Socket, Server as IOServer } from 'socket.io';
import { SetVideoDataSchema, VideoControlDataSchema, SyncCheckDataSchema } from '@/types';
import { SocketEvents, SocketData } from '../types';
import { validateData, emitSystemMessage } from '../utils';
import { handleServiceError } from '../error-handler';
import { VideoService, createSocketContext } from '@/server/services';
import { logEvent } from '@/server/logger';

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

      const result = await VideoService.setVideo(
        { roomId: validatedData.roomId, videoUrl: validatedData.videoUrl },
        ctx
      );

      io.to(validatedData.roomId).emit('video-set', {
        videoUrl: result.playbackUrl,
        videoType: result.videoType,
        videoMeta: result.videoMeta,
      });
      emitSystemMessage(io, validatedData.roomId, 'Video source changed', 'video-change', {
        videoUrl: result.playbackUrl,
      });
    } catch (error) {
      const message =
        (error as Error)?.message === 'Unsupported protocol' ? 'Only http/https video links are supported' : undefined;
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
  socket.on('sync-check', async data => {
    try {
      const validatedData = validateData(SyncCheckDataSchema, data, socket);
      if (!validatedData) return;

      const ctx = createSocketContext(socket.data);
      if (!ctx) {
        socket.emit('error', { error: 'Hmm, we lost your connection details.' });
        return;
      }

      const result = await VideoService.handleSyncCheck(
        {
          roomId: validatedData.roomId,
          currentTime: validatedData.currentTime,
          isPlaying: validatedData.isPlaying,
          timestamp: validatedData.timestamp,
        },
        ctx
      );

      socket.to(validatedData.roomId).emit('sync-update', {
        currentTime: result.currentTime,
        isPlaying: result.isPlaying,
        timestamp: result.timestamp,
      });
    } catch (error) {
      handleServiceError(error, socket);
    }
  });

  // Video error report (client reports playback failure)
  socket.on(
    'video-error-report',
    async ({ roomId, code, message, currentSrc, currentTime, isHost, codecUnparsable }) => {
      try {
        logEvent({
          level: 'warn',
          domain: 'video',
          event: 'error_report_received',
          message: 'video.error: client reported playback error',
          roomId,
          meta: { code, message, currentSrc, currentTime, isHost, codecUnparsable },
        });

        const result = await VideoService.handleErrorReport({
          roomId,
          code,
          message,
          currentSrc,
          currentTime,
          codecUnparsable,
        });

        if (result.fallbackApplied && result.newPlaybackUrl && result.videoMeta) {
          io.to(roomId).emit('video-set', {
            videoUrl: result.newPlaybackUrl,
            videoType: result.videoType!,
            videoMeta: result.videoMeta,
          });
          emitSystemMessage(io, roomId, 'Video source changed', 'video-change', {
            videoUrl: result.newPlaybackUrl,
          });
        }
      } catch (err) {
        logEvent({
          level: 'error',
          domain: 'video',
          event: 'error_report_failed',
          message: 'video.error: failed to handle error report',
          roomId,
          meta: { error: String(err) },
        });
      }
    }
  );
}
