'use client';

import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { logVideo } from '@/src/core/logger/client-logger';
import { useVideoSubtitleTracks } from '@/src/features/subtitles/hooks';
import type { SubtitleTrack } from '@/types/schemas';
import {
  createHlsRecoveryState,
  decideHlsRecovery,
  MAX_MEDIA_ERROR_RECOVERIES,
  MAX_NETWORK_RELOADS,
  type HlsRecoveryState,
} from '@/src/core/video/hls-error-policy';

export interface HLSPlayerRef {
  play: () => Promise<void>;
  pause: () => void;
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
  isPaused: () => boolean;
  getDuration: () => number;
  getVideoElement: () => HTMLVideoElement | null;
  /** Sets native playbackRate for smooth sub-second sync glide. Plain native-element write —
   *  no hls.js API call, no buffer flush. */
  setPlaybackRate: (rate: number) => void;
}

interface HLSPlayerProps {
  src: string;
  onPlay?: () => void;
  onPause?: () => void;
  onSeeked?: () => void;
  onLoadedMetadata?: () => void;
  onTimeUpdate?: () => void;
  onError?: (info: {
    type?: string;
    details?: string;
    fatal?: boolean;
    url?: string;
    responseCode?: number;
    codecUnparsable?: boolean;
    currentTime?: number;
  }) => void;
  className?: string;
  isHost?: boolean;
  // Kept for compatibility
  useProxy?: boolean;
  subtitleTracks?: SubtitleTrack[];
  activeSubtitleTrack?: string;
}

const HLSPlayer = forwardRef<HLSPlayerRef, HLSPlayerProps>(
  (
    {
      src,
      onPlay,
      onPause,
      onSeeked,
      onLoadedMetadata,
      onTimeUpdate,
      onError,
      className = '',
      isHost = false,
      // Kept for compatibility
      subtitleTracks = [],
      activeSubtitleTrack,
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<{ destroy: () => void; startLoad: () => void } | null>(null);
    const programmaticActionRef = useRef(false);
    const recoveryStateRef = useRef<HlsRecoveryState>(createHlsRecoveryState());

    // Inject native <track> elements for iOS Safari native HLS playback
    useVideoSubtitleTracks({
      videoElement: videoRef.current,
      subtitleTracks,
      activeSubtitleTrack,
    });

    useImperativeHandle(ref, () => ({
      play: async () => {
        if (videoRef.current) {
          try {
            programmaticActionRef.current = true;
            await videoRef.current.play();
          } catch (error) {
            logVideo('play_error', 'Error playing HLS video', { error });
          }
        }
      },
      pause: () => {
        if (videoRef.current) {
          programmaticActionRef.current = true;
          videoRef.current.pause();
        }
      },
      getCurrentTime: () => {
        return videoRef.current?.currentTime || 0;
      },
      seekTo: (time: number) => {
        if (videoRef.current) {
          programmaticActionRef.current = true;
          videoRef.current.currentTime = time;
        }
      },
      isPaused: () => {
        return videoRef.current?.paused ?? true;
      },
      getDuration: () => {
        return videoRef.current?.duration || 0;
      },
      getVideoElement: () => {
        return videoRef.current;
      },
      setPlaybackRate: (rate: number) => {
        if (videoRef.current) {
          videoRef.current.preservesPitch = true;
          videoRef.current.playbackRate = rate;
        }
      },
    }));

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !src) return;

      // Reset recovery state when src changes
      recoveryStateRef.current = createHlsRecoveryState();

      const loadHLS = async () => {
        try {
          const { default: Hls } = await import('hls.js');

          if (Hls.isSupported()) {
            const hls = new Hls({
              enableWorker: true,
              maxBufferLength: 60,
              maxMaxBufferLength: 600,
              maxBufferSize: 60 * 1000 * 1000,
              startFragPrefetch: true,
              maxLoadingDelay: 4,
            });

            hlsRef.current = hls as { destroy: () => void; startLoad: () => void };
            hls.loadSource(src);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              logVideo('hls_manifest_parsed', 'HLS manifest loaded');
            });

            // Diagnostic: log segment load events for debugging buffer issues
            hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
              logVideo('hls_frag_loaded', 'Segment loaded', {
                frag: data.frag?.url,
                duration: data.frag?.duration,
              });
            });

            // Diagnostic: log buffer emergency aborts (indicates playback stalling)
            hls.on(Hls.Events.FRAG_LOAD_EMERGENCY_ABORTED, (_event, data) => {
              logVideo('hls_emergency_abort', 'Buffer emergency - segment load aborted', {
                frag: data.frag?.url,
              });
            });

            // Diagnostic: log buffer appends to track buffer health
            hls.on(Hls.Events.BUFFER_APPENDED, (_event, data) => {
              logVideo('hls_buffer_appended', 'Buffer appended', {
                timeRanges: video.buffered.length,
                bufferType: data.type,
              });
            });

            hls.on(Hls.Events.LEVEL_SWITCHING, (_event: unknown, data: unknown) => {
              const levelData = data as { level?: number };
              logVideo('hls_level_switch', 'HLS quality level switching', {
                level: levelData.level,
              });
            });

            hls.on(Hls.Events.ERROR, (_event: unknown, data: unknown) => {
              const errorData = data as {
                fatal?: boolean;
                type?: string;
                details?: string;
                response?: { code?: number };
                url?: string;
              };

              const responseCode = errorData.response?.code;

              const decision = decideHlsRecovery({
                error: {
                  type: errorData.type,
                  details: errorData.details,
                  fatal: errorData.fatal,
                  responseCode,
                },
                state: recoveryStateRef.current,
                now: Date.now(),
              });

              logVideo('hls_error', 'HLS error', {
                type: errorData.type,
                details: errorData.details,
                fatal: errorData.fatal,
                url: errorData.url,
                responseCode,
                currentTime: video.currentTime,
                codecUnparsable: decision.codecUnparsable,
                action: decision.action,
              });

              switch (decision.action) {
                case 'ignore':
                  return;

                case 'recover-media':
                  logVideo('hls_media_recovery', 'Attempting HLS media error recovery', {
                    attempt: recoveryStateRef.current.mediaRecoveryCount,
                    maxAttempts: MAX_MEDIA_ERROR_RECOVERIES,
                    details: errorData.details,
                  });
                  hls.recoverMediaError();
                  return;

                case 'reload-network':
                  logVideo('hls_network_reload', 'Attempting HLS network reload (startLoad)', {
                    attempt: recoveryStateRef.current.networkReloadCount,
                    maxAttempts: MAX_NETWORK_RELOADS,
                    details: errorData.details,
                  });
                  hls.startLoad();
                  return;

                case 'reattach':
                  logVideo('hls_reattach', 'Attempting HLS detach+reattach after media error exhaustion', {
                    src,
                    details: errorData.details,
                  });
                  hls.destroy();
                  hlsRef.current = null;
                  // Re-trigger loadHLS after a short delay
                  setTimeout(() => loadHLS(), 500);
                  return;

                case 'terminal':
                  onError?.({
                    type: errorData.type,
                    details: errorData.details,
                    fatal: true,
                    url: errorData.url,
                    responseCode,
                    codecUnparsable: decision.codecUnparsable,
                    currentTime: video.currentTime,
                  });
                  hls.destroy();
                  return;
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
            logVideo('hls_native', 'Using native HLS support');
          } else {
            logVideo('hls_unsupported', 'HLS is not supported in this browser');
          }
        } catch (error) {
          logVideo('hls_load_failed', 'Failed to load HLS.js', { error });
          // Fallback to trying native support
          if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
          }
        }
      };

      loadHLS();

      return () => {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]);

    const handlePlay = () => {
      logVideo('hls_play', 'HLS video started playing', { programmatic: programmaticActionRef.current, isHost });
      // Only emit if this is a user action (not programmatic) and user is host
      if (!programmaticActionRef.current && isHost) {
        onPlay?.();
      }
      programmaticActionRef.current = false;
    };

    const handlePause = () => {
      logVideo('hls_pause', 'HLS video paused', { programmatic: programmaticActionRef.current, isHost });
      // Only emit if this is a user action (not programmatic) and user is host
      if (!programmaticActionRef.current && isHost) {
        onPause?.();
      }
      programmaticActionRef.current = false;
    };

    const handleSeeked = () => {
      logVideo('hls_seeked', 'HLS video seeked', {
        time: videoRef.current?.currentTime,
        programmatic: programmaticActionRef.current,
        isHost,
      });
      // Only emit if this is a user action (not programmatic) and user is host
      if (!programmaticActionRef.current && isHost) {
        onSeeked?.();
      }
      programmaticActionRef.current = false;
    };

    const handleLoadedMetadata = () => {
      logVideo('hls_metadata_loaded', 'HLS video metadata loaded');
      onLoadedMetadata?.();
    };

    const handleTimeUpdate = () => {
      onTimeUpdate?.();
    };

    return (
      <video
        ref={videoRef}
        className={`${className}`}
        controls={false} // Always use custom controls
        onPlay={handlePlay}
        onPause={handlePause}
        onSeeked={handleSeeked}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        playsInline
        preload="metadata"
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture={false}
        crossOrigin="anonymous"
      />
    );
  }
);

HLSPlayer.displayName = 'HLSPlayer';

export { HLSPlayer };
