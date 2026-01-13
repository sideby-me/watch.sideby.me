'use client';

import { useRef, useCallback } from 'react';
import { useSocket } from '@/src/core/socket';
import { YouTubePlayerRef, YT_STATES } from '@/src/core/video/youtube-player';
import { HLSPlayerRef } from '@/src/core/video/hls-player';
import { CastPlayerRef } from '@/src/features/media/cast';
import { calculateCurrentTime } from '@/src/lib/video-utils';
import { Room, User } from '@/types';
import { logDebug } from '@/src/core/logger';

// Re-export VideoPlayerRef type for consumers
export interface VideoPlayerRef {
  play: () => void;
  pause: () => void;
  seekTo: (time: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  isPaused: () => boolean;
  getVideoElement: () => HTMLVideoElement | null;
  debugSubtitles?: () => void;
}

interface UseVideoSyncOptions {
  room: Room | null;
  currentUser: User | null;
  roomId: string;
  youtubePlayerRef: React.RefObject<YouTubePlayerRef | null>;
  videoPlayerRef: React.RefObject<VideoPlayerRef | null>;
  hlsPlayerRef: React.RefObject<HLSPlayerRef | null>;
  castPlayerRef?: React.RefObject<CastPlayerRef | null>;
  isCasting?: boolean;
}

interface UseVideoSyncReturn {
  syncVideo: (targetTime: number, isPlaying: boolean | null, timestamp: number) => void;
  startSyncCheck: () => void;
  stopSyncCheck: () => void;
  handleVideoPlay: () => void;
  handleVideoPause: () => void;
  handleVideoSeek: () => void;
  handleYouTubeStateChange: (state: number) => void;
  handleSetVideo: (videoUrl: string) => void;
  handleVideoControlAttempt: () => void;
  applyPendingSync: () => void;
}

export function useVideoSync({
  room,
  currentUser,
  roomId,
  youtubePlayerRef,
  videoPlayerRef,
  hlsPlayerRef,
  castPlayerRef,
  isCasting = false,
}: UseVideoSyncOptions): UseVideoSyncReturn {
  const { socket } = useSocket();

  const lastSyncTimeRef = useRef<number>(0);
  const lastControlActionRef = useRef<{ timestamp: number; type: string; userId: string | null }>({
    timestamp: 0,
    type: '',
    userId: null,
  });
  const lastPlayerTimeRef = useRef<number>(0);
  const syncCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSyncRef = useRef<{ targetTime: number; isPlaying: boolean | null; timestamp: number } | null>(null);

  // Get current player based on video type (prioritize cast player when casting)
  const getCurrentPlayer = useCallback(() => {
    if (!room) return null;

    // Prioritize cast player when casting is active
    if (isCasting && castPlayerRef?.current) {
      return castPlayerRef.current;
    }

    return room.videoType === 'youtube'
      ? youtubePlayerRef.current
      : room.videoType === 'm3u8'
        ? hlsPlayerRef.current
        : videoPlayerRef.current;
  }, [room, youtubePlayerRef, videoPlayerRef, hlsPlayerRef, castPlayerRef, isCasting]);

  // Sync video playback
  const syncVideo = useCallback(
    (targetTime: number, isPlaying: boolean | null, timestamp: number) => {
      if (!room || !currentUser) return;

      // Don't sync if this user just performed the action (prevent feedback loop)
      const now = Date.now();
      const timeSinceLastAction = now - lastControlActionRef.current.timestamp;
      if (lastControlActionRef.current.userId === currentUser.id && timeSinceLastAction < 500) {
        logDebug('video', 'sync_skip', 'Skipping sync - user just performed this action');
        return;
      }

      const player = getCurrentPlayer();
      if (!player) return;

      // For MP4/HLS, check if player has loaded metadata before syncing
      if (room.videoType !== 'youtube') {
        const videoElement = (player as { getVideoElement?: () => HTMLVideoElement | null }).getVideoElement?.();
        if (videoElement && videoElement.readyState < 1) {
          // Player not ready, queue sync for later
          logDebug('video', 'sync_queued', 'Player not ready, queueing sync for after metadata load', {
            targetTime,
            readyState: videoElement.readyState,
          });
          pendingSyncRef.current = { targetTime, isPlaying, timestamp };
          return;
        }
      }
      pendingSyncRef.current = null;

      const adjustedTime = calculateCurrentTime({
        currentTime: targetTime,
        isPlaying: isPlaying ?? false,
        lastUpdateTime: timestamp,
      });

      // Check if we need to sync
      const currentTime = player.getCurrentTime();
      const syncDiff = Math.abs(currentTime - adjustedTime);

      // Detect large seek for observability (potential decoder stress)
      const LARGE_SEEK_THRESHOLD_SECONDS = 30;
      if (syncDiff > LARGE_SEEK_THRESHOLD_SECONDS && room.videoType !== 'youtube') {
        logDebug('video', 'sync_large_seek', `Large seek detected: ${syncDiff.toFixed(1)}s`, {
          from: currentTime,
          to: adjustedTime,
        });
      }

      if (syncDiff > 1.5) {
        logDebug(
          'video',
          'sync_seek',
          `Syncing video: ${syncDiff.toFixed(2)}s difference, seeking to ${adjustedTime.toFixed(2)}s`
        );
        player.seekTo(adjustedTime);
        lastSyncTimeRef.current = now;
        lastPlayerTimeRef.current = adjustedTime;
      }

      // Handle play/pause state
      if (isPlaying !== null) {
        if (room.videoType === 'youtube') {
          const ytPlayer = player as YouTubePlayerRef;
          const currentState = ytPlayer.getPlayerState();

          if (isPlaying && currentState !== YT_STATES.PLAYING) {
            logDebug('video', 'sync_play', 'Syncing play state');
            ytPlayer.play();
          } else if (!isPlaying && currentState === YT_STATES.PLAYING) {
            logDebug('video', 'sync_pause', 'Syncing pause state');
            ytPlayer.pause();
          }
        } else {
          const videoPlayer = player as VideoPlayerRef | HLSPlayerRef;

          if (isPlaying && videoPlayer.isPaused()) {
            logDebug('video', 'sync_play', 'Syncing play state');
            videoPlayer.play();
          } else if (!isPlaying && !videoPlayer.isPaused()) {
            logDebug('video', 'sync_pause', 'Syncing pause state');
            videoPlayer.pause();
          }
        }
      }
    },
    [room, currentUser, getCurrentPlayer]
  );

  // Periodic sync check for hosts
  const startSyncCheck = useCallback(() => {
    if (syncCheckIntervalRef.current) {
      clearInterval(syncCheckIntervalRef.current);
    }

    // Use shorter interval when casting for faster sync convergence
    const syncInterval = isCasting ? 2000 : 5000;

    syncCheckIntervalRef.current = setInterval(() => {
      if (!room || !currentUser?.isHost || !socket) return;

      const player = getCurrentPlayer();
      if (!player) return;

      const currentTime = player.getCurrentTime();

      let isPlaying: boolean;
      if ('getPlayerState' in player) {
        isPlaying = player.getPlayerState() === YT_STATES.PLAYING;
      } else if ('isPaused' in player) {
        isPlaying = !player.isPaused();
      } else {
        isPlaying = false;
      }

      logDebug('video', 'sync_check', `Periodic sync check: ${currentTime.toFixed(2)}s, playing: ${isPlaying}`);
      socket.emit('sync-check', {
        roomId,
        currentTime,
        isPlaying,
        timestamp: Date.now(),
      });
    }, syncInterval);
  }, [room, currentUser, socket, roomId, getCurrentPlayer, isCasting]);

  const stopSyncCheck = useCallback(() => {
    if (syncCheckIntervalRef.current) {
      clearInterval(syncCheckIntervalRef.current);
      syncCheckIntervalRef.current = null;
    }
  }, []);

  // Video control handlers for hosts
  const handleVideoPlay = useCallback(() => {
    logDebug('video', 'play_called', 'handleVideoPlay called', {
      hasRoom: !!room,
      isHost: currentUser?.isHost,
      hasSocket: !!socket,
    });
    if (!room || !currentUser?.isHost || !socket) return;

    const player = getCurrentPlayer();
    if (!player) {
      logDebug('video', 'play_no_player', 'No player found');
      return;
    }

    const currentTime = player.getCurrentTime();
    logDebug('video', 'play_emit', 'Emitting play-video', { roomId, currentTime });

    lastControlActionRef.current = {
      timestamp: Date.now(),
      type: 'play',
      userId: currentUser.id,
    };

    socket.emit('play-video', { roomId, currentTime });
  }, [room, currentUser, socket, roomId, getCurrentPlayer]);

  const handleVideoPause = useCallback(() => {
    if (!room || !currentUser?.isHost || !socket) return;

    const player = getCurrentPlayer();
    if (!player) return;

    const currentTime = player.getCurrentTime();

    lastControlActionRef.current = {
      timestamp: Date.now(),
      type: 'pause',
      userId: currentUser.id,
    };

    socket.emit('pause-video', { roomId, currentTime });
  }, [room, currentUser, socket, roomId, getCurrentPlayer]);

  const handleVideoSeek = useCallback(
    (explicitTime?: number) => {
      if (!room || !currentUser?.isHost || !socket) return;

      const player = getCurrentPlayer();
      if (!player && explicitTime === undefined) return;

      const currentTime = explicitTime ?? player!.getCurrentTime();

      // If explicit time provided, seek the player to that time
      if (explicitTime !== undefined && player) {
        player.seekTo(explicitTime);
      }

      lastControlActionRef.current = {
        timestamp: Date.now(),
        type: 'seek',
        userId: currentUser.id,
      };

      socket.emit('seek-video', { roomId, currentTime });
    },
    [room, currentUser, socket, roomId, getCurrentPlayer]
  );

  const handleYouTubeStateChange = useCallback(
    (state: number) => {
      if (!currentUser?.isHost || !socket) return;

      const player = youtubePlayerRef.current;
      if (!player) return;

      const currentTime = player.getCurrentTime();

      if (state === YT_STATES.PLAYING) {
        // Check if this is a seek by comparing with last known time
        const timeDiff = Math.abs(currentTime - lastPlayerTimeRef.current);
        if (timeDiff > 1) {
          logDebug('video', 'yt_seek_detected', `Detected seek to ${currentTime.toFixed(2)}s before play`);
          lastControlActionRef.current = {
            timestamp: Date.now(),
            type: 'seek',
            userId: currentUser.id,
          };
          socket.emit('seek-video', { roomId, currentTime });
        }

        lastControlActionRef.current = {
          timestamp: Date.now(),
          type: 'play',
          userId: currentUser.id,
        };
        lastPlayerTimeRef.current = currentTime;
        socket.emit('play-video', { roomId, currentTime });
      } else if (state === YT_STATES.PAUSED) {
        lastControlActionRef.current = {
          timestamp: Date.now(),
          type: 'pause',
          userId: currentUser.id,
        };
        lastPlayerTimeRef.current = currentTime;
        socket.emit('pause-video', { roomId, currentTime });
      } else if (state === YT_STATES.BUFFERING) {
        // Check for potential seek during buffering
        const timeDiff = Math.abs(currentTime - lastPlayerTimeRef.current);
        if (timeDiff > 1) {
          logDebug('video', 'yt_seek_buffering', `Detected seek to ${currentTime.toFixed(2)}s during buffering`);
          lastControlActionRef.current = {
            timestamp: Date.now(),
            type: 'seek',
            userId: currentUser.id,
          };
          lastPlayerTimeRef.current = currentTime;
          socket.emit('seek-video', { roomId, currentTime });
        }
      }
    },
    [currentUser, socket, roomId, youtubePlayerRef]
  );

  const handleSetVideo = useCallback(
    (videoUrl: string) => {
      if (!socket || !currentUser?.isHost) return;
      socket.emit('set-video', { roomId, videoUrl });
    },
    [socket, currentUser?.isHost, roomId]
  );

  const handleVideoControlAttempt = useCallback(() => {
    // This will be handled by the component that uses this hook
    logDebug('video', 'control_attempt', 'Video control attempted by non-host');
  }, []);

  // Apply any pending sync that was queued while player was loading
  const applyPendingSync = useCallback(() => {
    if (pendingSyncRef.current) {
      const { targetTime, isPlaying, timestamp } = pendingSyncRef.current;
      logDebug('video', 'sync_apply_pending', 'Applying queued sync after player became ready', { targetTime });
      pendingSyncRef.current = null;
      // Re-invoke syncVideo now that player should be ready
      syncVideo(targetTime, isPlaying, timestamp);
    }
  }, [syncVideo]);

  return {
    syncVideo,
    startSyncCheck,
    stopSyncCheck,
    handleVideoPlay,
    handleVideoPause,
    handleVideoSeek,
    handleYouTubeStateChange,
    handleSetVideo,
    handleVideoControlAttempt,
    applyPendingSync,
  };
}
