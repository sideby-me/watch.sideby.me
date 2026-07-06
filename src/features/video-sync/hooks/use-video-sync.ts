'use client';

import { useRef, useCallback, useEffect } from 'react';
import { useSocket } from '@/src/core/socket';
import { YouTubePlayerRef, YT_STATES } from '@/src/core/video/youtube-player';
import { HLSPlayerRef } from '@/src/core/video/hls-player';
import { CastPlayerRef } from '@/src/features/media/cast';
import { calculateCurrentTime } from '@/src/lib/video-utils';
import { SYNC_COOLDOWN_MS, HOST_REANCHOR_MS, SYNC_CORRECTOR_INTERVAL_MS } from '@/src/lib/constants';
import { decideCorrection, shouldApplySyncUpdate, type CorrectorMode } from '@/src/features/video-sync/lib/corrector';
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
  setPlaybackRate?: (rate: number) => void;
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
  clockOffset?: number;
}

interface UseVideoSyncReturn {
  syncVideo: (targetTime: number, isPlaying: boolean | null, timestamp: number, rate?: number) => void;
  startSyncCheck: () => void;
  stopSyncCheck: () => void;
  handleVideoPlay: () => void;
  handleVideoPause: () => void;
  handleVideoSeek: () => void;
  handleYouTubeStateChange: (state: number) => void;
  handleSetVideo: (videoUrl: string, pageUrl?: string | null) => void;
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
  clockOffset = 0,
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
  const pendingSyncRef = useRef<{
    targetTime: number;
    isPlaying: boolean | null;
    timestamp: number;
    rate: number;
  } | null>(null);

  // Whether the current player's playbackRate is currently nudged away from 1.0
  const rateNudgedRef = useRef<boolean>(false);
  // Latest sync-update anchor, continuously re-projected by the local corrector loop
  const syncAnchorRef = useRef<{ currentTime: number; isPlaying: boolean; rate: number; timestamp: number } | null>(
    null
  );
  const correctorIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Keep clockOffset in a ref so all callbacks always read the latest value
  const clockOffsetRef = useRef(clockOffset);
  clockOffsetRef.current = clockOffset;

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

  // Determine corrector mode: YouTube and Cast use the seek path (discrete
  // playbackRate steps / no rate setter); HTML5 (mp4) and HLS glide via playbackRate nudge.
  const getCorrectorMode = useCallback((): CorrectorMode => {
    if (!room) return 'seek';
    if (room.videoType === 'youtube') return 'seek';
    if (isCasting) return 'seek';
    return 'rate';
  }, [room, isCasting]);

  // Shared dual-band correction application, used by both the discrete syncVideo
  // hard/soft-band handling and the local ~400ms projection corrector loop.
  const applyCorrection = useCallback(
    (
      player: VideoPlayerRef | HLSPlayerRef | YouTubePlayerRef | CastPlayerRef,
      mode: CorrectorMode,
      drift: number,
      targetTime: number
    ) => {
      const serverNow = Date.now() + clockOffsetRef.current;
      const cooldownElapsed = serverNow - lastSyncTimeRef.current > SYNC_COOLDOWN_MS;

      const correction = decideCorrection({
        drift,
        mode,
        rateNudged: rateNudgedRef.current,
        cooldownElapsed,
      });

      const rateCapable = player as { setPlaybackRate?: (rate: number) => void };

      if (correction.action === 'nudge') {
        rateCapable.setPlaybackRate?.(correction.rate);
        rateNudgedRef.current = true;
      } else if (correction.action === 'none') {
        if (correction.resetRate) {
          rateCapable.setPlaybackRate?.(1.0);
        }
        rateNudgedRef.current = false;
      } else if (correction.action === 'seek') {
        rateCapable.setPlaybackRate?.(1.0);
        rateNudgedRef.current = false;
        logDebug(
          'video',
          'sync_seek',
          `Corrector seek: ${drift.toFixed(2)}s drift, seeking to ${targetTime.toFixed(2)}s`
        );
        player.seekTo(targetTime);
        lastSyncTimeRef.current = serverNow;
        lastPlayerTimeRef.current = targetTime;
      }
    },
    []
  );

  // Sync video playback
  const syncVideo = useCallback(
    (targetTime: number, isPlaying: boolean | null, timestamp: number, rate: number = 1) => {
      if (!room || !currentUser) return;

      // Timestamp-monotonicity guard: drop any authoritative update stamped before the
      // client's own last locally-issued intent. This is what prevents the host from being
      // yanked immediately after its own seek — a ticker tick racing the server's processing of
      // the intent carries a stale timestamp and is correctly dropped here.
      if (!shouldApplySyncUpdate(timestamp, lastControlActionRef.current.timestamp)) {
        logDebug('video', 'sync_skip_stale', 'Dropping stale sync update (timestamp predates last intent)');
        return;
      }

      // Don't sync if this user just performed the action (prevent feedback loop)
      const serverNow = Date.now() + clockOffsetRef.current;
      const timeSinceLastAction = serverNow - lastControlActionRef.current.timestamp;
      if (lastControlActionRef.current.userId === currentUser.id && timeSinceLastAction < 500) {
        logDebug('video', 'sync_skip', 'Skipping sync - user just performed this action');
        return;
      }

      // Update the local projection anchor so the corrector loop can glide continuously between
      // network updates. Preserve the last known isPlaying when this call is a pure seek (null).
      const anchorIsPlaying = isPlaying ?? syncAnchorRef.current?.isPlaying ?? false;
      syncAnchorRef.current = { currentTime: targetTime, isPlaying: anchorIsPlaying, rate, timestamp };

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
          pendingSyncRef.current = { targetTime, isPlaying, timestamp, rate };
          return;
        }
      }
      pendingSyncRef.current = null;

      const adjustedTime = calculateCurrentTime(
        {
          currentTime: targetTime,
          isPlaying: isPlaying ?? false,
          lastUpdateTime: timestamp,
          rate,
        },
        clockOffsetRef.current
      );

      // Check current drift
      const currentTime = player.getCurrentTime();
      const drift = adjustedTime - currentTime;
      const syncDiff = Math.abs(drift);

      // Detect large seek for observability (potential decoder stress) — preserved from the
      // legacy hard-seek path.
      const LARGE_SEEK_THRESHOLD_SECONDS = 30;
      if (syncDiff > LARGE_SEEK_THRESHOLD_SECONDS && room.videoType !== 'youtube') {
        logDebug('video', 'sync_large_seek', `Large seek detected: ${syncDiff.toFixed(1)}s`, {
          from: currentTime,
          to: adjustedTime,
        });
      }

      // Dual-band drift correction: dead-band -> nothing, soft-band -> playbackRate
      // glide (HTML5/HLS only), hard-band -> seek (cooldown-gated). Replaces the old bare
      // SYNC_TOLERANCE_S hard-seek.
      applyCorrection(player, getCorrectorMode(), drift, adjustedTime);

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
    [room, currentUser, getCurrentPlayer, applyCorrection, getCorrectorMode]
  );

  // Slow host->server re-anchor. The server ticker (PlaybackSyncTicker) is now the
  // authoritative broadcast; this periodic emit just keeps the server's authoritative position
  // honest against host-side buffering. No more fast casting path — the ticker covers cadence.
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

      logDebug('video', 'sync_check', `Host re-anchor: ${currentTime.toFixed(2)}s, playing: ${isPlaying}`);
      socket.emit('sync-check', {
        roomId,
        currentTime,
        isPlaying,
        timestamp: Date.now() + clockOffsetRef.current, // emit in server-time
      });
    }, HOST_REANCHOR_MS);
  }, [room, currentUser, socket, roomId, getCurrentPlayer]);

  const stopSyncCheck = useCallback(() => {
    if (syncCheckIntervalRef.current) {
      clearInterval(syncCheckIntervalRef.current);
      syncCheckIntervalRef.current = null;
    }
  }, []);

  // Local projection corrector loop. Projects the expected position from the
  // latest sync-update anchor every SYNC_CORRECTOR_INTERVAL_MS and runs the same dual-band
  // correction as syncVideo, giving continuous glide between PLAYBACK_TICK_MS network ticks
  // instead of only correcting once per server broadcast.
  useEffect(() => {
    if (!room?.videoUrl) return;

    if (correctorIntervalRef.current) {
      clearInterval(correctorIntervalRef.current);
    }

    correctorIntervalRef.current = setInterval(() => {
      const anchor = syncAnchorRef.current;
      if (!anchor) return;

      // Same timestamp-monotonicity guard syncVideo applies to incoming updates: never let
      // an anchor that predates the client's own last local intent drive a correction. Without this,
      // a stale pre-seek anchor keeps pulling the host back to the old position every tick until a
      // fresh server broadcast overwrites the anchor — the self-yank/flip-flop after a host seek.
      if (!shouldApplySyncUpdate(anchor.timestamp, lastControlActionRef.current.timestamp)) return;

      const player = getCurrentPlayer();
      if (!player) return;

      const projected = calculateCurrentTime(
        {
          currentTime: anchor.currentTime,
          isPlaying: anchor.isPlaying,
          lastUpdateTime: anchor.timestamp,
          rate: anchor.rate,
        },
        clockOffsetRef.current
      );

      const currentTime = player.getCurrentTime();
      const drift = projected - currentTime;

      applyCorrection(player, getCorrectorMode(), drift, projected);
    }, SYNC_CORRECTOR_INTERVAL_MS);

    return () => {
      if (correctorIntervalRef.current) {
        clearInterval(correctorIntervalRef.current);
        correctorIntervalRef.current = null;
      }
    };
  }, [room?.videoUrl, getCurrentPlayer, getCorrectorMode, applyCorrection]);

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
      timestamp: Date.now() + clockOffsetRef.current,
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
      timestamp: Date.now() + clockOffsetRef.current,
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
        timestamp: Date.now() + clockOffsetRef.current,
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
            timestamp: Date.now() + clockOffsetRef.current,
            type: 'seek',
            userId: currentUser.id,
          };
          socket.emit('seek-video', { roomId, currentTime });
        }

        lastControlActionRef.current = {
          timestamp: Date.now() + clockOffsetRef.current,
          type: 'play',
          userId: currentUser.id,
        };
        lastPlayerTimeRef.current = currentTime;
        socket.emit('play-video', { roomId, currentTime });
      } else if (state === YT_STATES.PAUSED) {
        lastControlActionRef.current = {
          timestamp: Date.now() + clockOffsetRef.current,
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
            timestamp: Date.now() + clockOffsetRef.current,
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
    (videoUrl: string, pageUrl?: string | null) => {
      if (!socket || !currentUser?.isHost) return;
      socket.emit('set-video', { roomId, videoUrl, ...(pageUrl ? { pageUrl } : {}) });
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
      const { targetTime, isPlaying, timestamp, rate } = pendingSyncRef.current;
      logDebug('video', 'sync_apply_pending', 'Applying queued sync after player became ready', { targetTime });
      pendingSyncRef.current = null;
      // Re-invoke syncVideo now that player should be ready
      syncVideo(targetTime, isPlaying, timestamp, rate);
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
