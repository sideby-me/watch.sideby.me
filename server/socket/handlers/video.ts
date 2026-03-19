import { Socket, Server as IOServer } from 'socket.io';
import { SetVideoDataSchema, VideoControlDataSchema, SyncCheckDataSchema, TimePingDataSchema } from '@/types';
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
        ctx,
        socket
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
        (error as Error)?.message === 'Unsupported protocol'
          ? 'Only http/https video links are supported'
          : (error as Error)?.message?.startsWith('DRM-protected content')
            ? (error as Error).message
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

  // Host-triggered manual URL refresh (re-dispatches original URL and broadcasts fresh uuid to room)
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
}
