'use client';

import { useRef, useCallback } from 'react';
import { useSocket } from '@/hooks/use-socket';
import { YouTubePlayerRef, YT_STATES } from '@/components/video/youtube-player';
import { VideoPlayerRef } from '@/components/video/video-player';
import { HLSPlayerRef } from '@/components/video/hls-player';
import { CastPlayerRef } from '@/hooks/use-google-cast';
import { calculateCurrentTime } from '@/lib/video-utils';
import { Room, User } from '@/types';

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
        console.log('🔄 Skipping sync - user just performed this action');
        return;
      }

      const player = getCurrentPlayer();
      if (!player) return;

      const adjustedTime = calculateCurrentTime({
        currentTime: targetTime,
        isPlaying: isPlaying ?? false,
        lastUpdateTime: timestamp,
      });

      // Check if we need to sync
      const currentTime = player.getCurrentTime();
      const syncDiff = Math.abs(currentTime - adjustedTime);

      if (syncDiff > 1.5) {
        console.log(`🎬 Syncing video: ${syncDiff.toFixed(2)}s difference, seeking to ${adjustedTime.toFixed(2)}s`);
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
            console.log('▶️ Syncing play state');
            ytPlayer.play();
          } else if (!isPlaying && currentState === YT_STATES.PLAYING) {
            console.log('⏸️ Syncing pause state');
            ytPlayer.pause();
          }
        } else {
          const videoPlayer = player as VideoPlayerRef | HLSPlayerRef;

          if (isPlaying && videoPlayer.isPaused()) {
            console.log('▶️ Syncing play state');
            videoPlayer.play();
          } else if (!isPlaying && !videoPlayer.isPaused()) {
            console.log('⏸️ Syncing pause state');
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

      console.log(`🔄 Periodic sync check: ${currentTime.toFixed(2)}s, playing: ${isPlaying}`);
      socket.emit('sync-check', {
        roomId,
        currentTime,
        isPlaying,
        timestamp: Date.now(),
      });
    }, 5000);
  }, [room, currentUser, socket, roomId, getCurrentPlayer]);

  const stopSyncCheck = useCallback(() => {
    if (syncCheckIntervalRef.current) {
      clearInterval(syncCheckIntervalRef.current);
      syncCheckIntervalRef.current = null;
    }
  }, []);

  // Video control handlers for hosts
  const handleVideoPlay = useCallback(() => {
    console.log('handleVideoPlay called', { hasRoom: !!room, isHost: currentUser?.isHost, hasSocket: !!socket });
    if (!room || !currentUser?.isHost || !socket) return;

    const player = getCurrentPlayer();
    if (!player) {
      console.log('No player found');
      return;
    }

    const currentTime = player.getCurrentTime();
    console.log('Emitting play-video', { roomId, currentTime });

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

  const handleVideoSeek = useCallback(() => {
    if (!room || !currentUser?.isHost || !socket) return;

    const player = getCurrentPlayer();
    if (!player) return;

    const currentTime = player.getCurrentTime();

    lastControlActionRef.current = {
      timestamp: Date.now(),
      type: 'seek',
      userId: currentUser.id,
    };

    socket.emit('seek-video', { roomId, currentTime });
  }, [room, currentUser, socket, roomId, getCurrentPlayer]);

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
          console.log(`🎯 Detected seek to ${currentTime.toFixed(2)}s before play`);
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
          console.log(`🎯 Detected seek to ${currentTime.toFixed(2)}s during buffering`);
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
    console.log('Video control attempted by non-host');
  }, []);

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
  };
}
