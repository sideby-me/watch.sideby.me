import { Socket, Server as IOServer } from 'socket.io';
import { redisService } from '@/server/redis';
import { SetVideoDataSchema, VideoControlDataSchema, SyncCheckDataSchema } from '@/types';
import { SocketEvents, SocketData } from '../types';
import { validateData, emitSystemMessage } from '../utils';
import { resolveSource } from '@/server/video/resolve-source';

// Map to store pause timeouts per room
const lastErrorReport: Record<string, number> = {};
const lastPlayEmitTime: Record<string, number> = {};
const lastPauseEmitTime: Record<string, number> = {};

export function registerVideoHandlers(socket: Socket<SocketEvents, SocketEvents, object, SocketData>, io: IOServer) {
  // Set video URL
  socket.on('set-video', async data => {
    try {
      const validatedData = validateData(SetVideoDataSchema, data, socket);
      if (!validatedData) return;

      const { roomId, videoUrl } = validatedData;
      const room = await redisService.rooms.getRoom(roomId);
      if (!room) {
        socket.emit('room-error', { error: `Hmm, we couldn't find a room with that code. Maybe a typo?` });
        return;
      }

      const currentUser = room.users.find(u => u.id === socket.data.userId);
      if (!currentUser?.isHost) {
        socket.emit('error', { error: 'Only hosts can set the video' });
        return;
      }

      // Resolve source centrally
      const meta = await resolveSource(videoUrl);
      // Map delivery types to legacy videoType for backward compatibility
      let legacyVideoType: 'youtube' | 'mp4' | 'm3u8' = 'mp4';
      if (meta.videoType === 'youtube') legacyVideoType = 'youtube';
      else if (meta.videoType === 'm3u8') legacyVideoType = 'm3u8';
      else legacyVideoType = 'mp4';

      await redisService.rooms.setVideoUrl(roomId, meta.playbackUrl, legacyVideoType, meta);

      io.to(roomId).emit('video-set', { videoUrl: meta.playbackUrl, videoType: legacyVideoType, videoMeta: meta });
      emitSystemMessage(io, roomId, `Video source changed`, 'video-change', {
        videoUrl: meta.playbackUrl,
      });
      console.log(`Video set in room ${roomId}: ${videoUrl} -> playback: ${meta.playbackUrl} (${meta.deliveryType})`);
    } catch (error) {
      console.error('Error setting video:', error);
      const message =
        (error as Error)?.message === 'Unsupported protocol'
          ? 'Only http/https video links are supported'
          : 'Failed to set video';
      socket.emit('error', { error: message });
    }
  });

  // Play video
  socket.on('play-video', async data => {
    try {
      const validatedData = validateData(VideoControlDataSchema, data, socket);
      if (!validatedData) return;

      const { roomId, currentTime } = validatedData;
      const room = await redisService.rooms.getRoom(roomId);
      if (!room) {
        socket.emit('room-error', { error: `Hmm, we couldn't find a room with that code. Maybe a typo?` });
        return;
      }

      const currentUser = room.users.find(u => u.id === socket.data.userId);
      if (!currentUser?.isHost) {
        socket.emit('error', { error: 'Only hosts can control the video' });
        return;
      }

      // Only announce resume if we were actually paused
      // AND debounce duplicate play events (client sometimes sends double)
      const now = Date.now();
      const lastEmit = lastPlayEmitTime[roomId] || 0;
      if (!room.videoState.isPlaying && now - lastEmit > 1000) {
        emitSystemMessage(io, roomId, 'Video resumed', 'play', { userName: currentUser.name });
        lastPlayEmitTime[roomId] = now;
      }

      const videoState = {
        isPlaying: true,
        currentTime,
        duration: room.videoState.duration,
        lastUpdateTime: Date.now(),
      };

      await redisService.rooms.updateVideoState(roomId, videoState);

      socket.to(roomId).emit('video-played', {
        currentTime,
        timestamp: videoState.lastUpdateTime,
      });

      console.log(`Video played in room ${roomId} at ${currentTime}s`);
    } catch (error) {
      console.error('Error playing video:', error);
      socket.emit('error', { error: 'Failed to play video' });
    }
  });

  // Pause video
  socket.on('pause-video', async data => {
    try {
      const validatedData = validateData(VideoControlDataSchema, data, socket);
      if (!validatedData) return;

      const { roomId, currentTime } = validatedData;
      const room = await redisService.rooms.getRoom(roomId);
      if (!room) {
        socket.emit('room-error', { error: `Hmm, we couldn't find a room with that code. Maybe a typo?` });
        return;
      }

      const currentUser = room.users.find(u => u.id === socket.data.userId);
      if (!currentUser?.isHost) {
        socket.emit('error', { error: 'Only hosts can control the video' });
        return;
      }

      const videoState = {
        isPlaying: false,
        currentTime,
        duration: room.videoState.duration,
        lastUpdateTime: Date.now(),
      };

      await redisService.rooms.updateVideoState(roomId, videoState);

      socket.to(roomId).emit('video-paused', {
        currentTime,
        timestamp: videoState.lastUpdateTime,
      });

      // Announce pause immediately (no throttle), but debounce duplicates
      const now = Date.now();
      const lastEmit = lastPauseEmitTime[roomId] || 0;
      if (now - lastEmit > 1000) {
        emitSystemMessage(io, roomId, 'Video paused', 'pause', { userName: currentUser.name });
        lastPauseEmitTime[roomId] = now;
      }

      console.log(`Video paused in room ${roomId} at ${currentTime}s`);
    } catch (error) {
      console.error('Error pausing video:', error);
      socket.emit('error', { error: 'Failed to pause video' });
    }
  });

  // Seek video
  socket.on('seek-video', async data => {
    try {
      const validatedData = validateData(VideoControlDataSchema, data, socket);
      if (!validatedData) return;

      const { roomId, currentTime } = validatedData;
      const room = await redisService.rooms.getRoom(roomId);
      if (!room) {
        socket.emit('room-error', { error: `Hmm, we couldn't find a room with that code. Maybe a typo?` });
        return;
      }

      const currentUser = room.users.find(u => u.id === socket.data.userId);
      if (!currentUser?.isHost) {
        socket.emit('error', { error: 'Only hosts can control the video' });
        return;
      }

      const videoState = {
        ...room.videoState,
        currentTime,
        lastUpdateTime: Date.now(),
      };

      await redisService.rooms.updateVideoState(roomId, videoState);

      socket.to(roomId).emit('video-seeked', {
        currentTime,
        timestamp: videoState.lastUpdateTime,
      });

      console.log(`Video seeked in room ${roomId} to ${currentTime}s`);
    } catch (error) {
      console.error('Error seeking video:', error);
      socket.emit('error', { error: 'Failed to seek video' });
    }
  });

  // Sync check for hosts
  socket.on('sync-check', async data => {
    try {
      const validatedData = validateData(SyncCheckDataSchema, data, socket);
      if (!validatedData) return;

      const { roomId, currentTime, isPlaying, timestamp } = validatedData;

      if (!socket.data.userId) {
        socket.emit('error', { error: `Hmm, we lost your connection details.` });
        return;
      }

      const room = await redisService.rooms.getRoom(roomId);
      if (!room) {
        socket.emit('room-error', { error: `Hmm, we couldn't find a room with that code. Maybe a typo?` });
        return;
      }

      const currentUser = room.users.find(u => u.id === socket.data.userId);
      if (!currentUser?.isHost) {
        socket.emit('error', { error: 'Only hosts can send sync checks' });
        return;
      }

      // Broadcast sync update to all other users
      socket.to(roomId).emit('sync-update', { currentTime, isPlaying, timestamp });

      console.log(`Sync check sent in room ${roomId}: ${currentTime.toFixed(2)}s, playing: ${isPlaying}`);
    } catch (error) {
      console.error('Error sending sync check:', error);
      socket.emit('error', { error: 'Failed to send sync check' });
    }
  });

  // Late failure error report (client indicates playback failure mid-session)
  socket.on('video-error-report', async ({ roomId, code, message, currentSrc, currentTime: _currentTime }) => {
    try {
      const now = Date.now();
      if (lastErrorReport[roomId] && now - lastErrorReport[roomId] < 8000) {
        return; // Ignore rapid repeats
      }
      lastErrorReport[roomId] = now;

      const room = await redisService.rooms.getRoom(roomId);
      if (!room) return;

      const videoMeta = (room as unknown as { videoMeta?: unknown }).videoMeta as
        | {
            originalUrl?: string;
            playbackUrl: string;
            requiresProxy?: boolean;
          }
        | undefined;
      if (!videoMeta) return;

      // Ignore if already proxying or report src doesn't match current playback
      if (videoMeta.requiresProxy) return;
      if (currentSrc && currentSrc !== videoMeta.playbackUrl) {
        return;
      }

      console.log(`Late video error reported in room ${roomId}: code=${code} msg=${message}`);

      // Re-resolve using originalUrl (not the playbackUrl) to see if we now need proxy
      const meta = await resolveSource(videoMeta.originalUrl || currentSrc);
      if (meta.playbackUrl !== videoMeta.playbackUrl) {
        // Update stored room video url & meta
        let legacyVideoType: 'youtube' | 'mp4' | 'm3u8' = 'mp4';
        if (meta.videoType === 'youtube') legacyVideoType = 'youtube';
        else if (meta.videoType === 'm3u8') legacyVideoType = 'm3u8';
        await redisService.rooms.setVideoUrl(roomId, meta.playbackUrl, legacyVideoType, meta);
        io.to(roomId).emit('video-set', { videoUrl: meta.playbackUrl, videoType: legacyVideoType, videoMeta: meta });
        emitSystemMessage(io, roomId, `Video source changed`, 'video-change', { videoUrl: meta.playbackUrl });
        console.log(`Re-resolved video source for room ${roomId} -> ${meta.deliveryType}`);
      }
    } catch (err) {
      console.error('Error handling video-error-report:', err);
    }
  });
}
