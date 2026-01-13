'use client';

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { isProxiedUrl, buildProxyUrl } from '@/src/lib/video-proxy-client';
import { logVideo } from '@/src/core/logger/client-logger';
import { useVideoSubtitleTracks } from '@/src/features/subtitles/hooks';
import type { SubtitleTrack } from '@/types/schemas';

export interface HLSPlayerRef {
  play: () => Promise<void>;
  pause: () => void;
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
  isPaused: () => boolean;
  getDuration: () => number;
  getVideoElement: () => HTMLVideoElement | null;
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
      useProxy = false,
      subtitleTracks = [],
      activeSubtitleTrack,
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<{ destroy: () => void } | null>(null);
    const programmaticActionRef = useRef(false);
    const proxyTriedRef = useRef<boolean>(!!useProxy);
    const mediaErrorRecoveryRef = useRef<number>(0);
    const reattachAttemptedRef = useRef<boolean>(false);
    const networkErrorCountRef = useRef<number>(0);
    const MAX_MEDIA_ERROR_RECOVERIES = 2;
    const [shouldProxy, setShouldProxy] = useState<boolean>(!!useProxy);

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
    }));

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !src) return;

      // Force proxy when URL contains embedded headers (needs proxy to extract them)
      const hasEmbeddedHeaders = src.includes('headers=');

      // Heuristically force proxy for Cloudflare worker style hosts that reject direct browser fetches
      const looksLikeWorkerHost = (() => {
        try {
          const hostname = new URL(src, window.location.href).hostname;
          return hostname.includes('workers.dev');
        } catch {
          return src.includes('workers.dev');
        }
      })();

      const initialProxy = !!useProxy || hasEmbeddedHeaders || looksLikeWorkerHost;

      // Reset proxy state and media error recovery counter when src changes
      proxyTriedRef.current = initialProxy;
      mediaErrorRecoveryRef.current = 0;
      reattachAttemptedRef.current = false;
      networkErrorCountRef.current = 0;
      setShouldProxy(initialProxy);

      // Check if HLS.js is supported
      const loadHLS = async () => {
        try {
          // Dynamically import HLS.js
          const { default: Hls } = await import('hls.js');

          const toProxyUrl = (target: string) => {
            if (!shouldProxy) return target;
            if (isProxiedUrl(target)) {
              return target;
            }
            try {
              const absolute = new URL(target, window.location.origin).toString();
              return buildProxyUrl(absolute, window.location.href);
            } catch {
              return buildProxyUrl(target, window.location.href);
            }
          };

          if (Hls.isSupported()) {
            // Use HLS.js for browsers that don't support HLS natively
            const hls = new Hls({
              enableWorker: true,
              maxBufferLength: 60,
              maxMaxBufferLength: 600,
              maxBufferSize: 60 * 1000 * 1000,
              startFragPrefetch: true,
              maxLoadingDelay: 4,
              // Only force proxying when requested; otherwise let Hls.js hit the origin directly
              xhrSetup: shouldProxy
                ? (xhr: XMLHttpRequest, url: string) => {
                    const proxied = toProxyUrl(url);
                    xhr.open('GET', proxied, true);
                  }
                : undefined,
            });

            hlsRef.current = hls as { destroy: () => void };
            hls.loadSource(shouldProxy ? toProxyUrl(src) : src);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              logVideo('hls_manifest_parsed', 'HLS manifest loaded');
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

              const isBufferStall = errorData.details === 'bufferStalledError' && errorData.fatal === false;
              if (isBufferStall) {
                logVideo('hls_buffer_stall', 'HLS buffer stalled (non-fatal)', {
                  currentTime: video.currentTime,
                });
                return;
              }

              const networkish =
                errorData.type === 'networkError' ||
                errorData.details === 'fragLoadError' ||
                errorData.details === 'manifestLoadError';

              if (networkish) {
                networkErrorCountRef.current += 1;
              }

              const codecUnparsable = Boolean(
                errorData.details &&
                  ['fragParsingError', 'manifestParsingError', 'levelParsingError', 'demux', 'parse'].some(token =>
                    errorData.details!.toLowerCase().includes(token.toLowerCase())
                  )
              );

              const willRetryViaProxy = !shouldProxy && networkish && !proxyTriedRef.current;
              if (willRetryViaProxy) {
                proxyTriedRef.current = true;
                setShouldProxy(true);
                hls.destroy();
                return;
              }

              const responseCode = errorData.response?.code;
              const hardHttpBlock = networkish && responseCode !== undefined && responseCode >= 400;

              const fatalishNetwork =
                networkish &&
                proxyTriedRef.current &&
                (errorData.fatal || hardHttpBlock || networkErrorCountRef.current > 1);

              if (fatalishNetwork) {
                onError?.({
                  type: errorData.type,
                  details: errorData.details,
                  fatal: true,
                  url: errorData.url,
                  responseCode,
                  codecUnparsable,
                  currentTime: video.currentTime,
                });
                hls.destroy();
                return;
              }

              logVideo('hls_error', 'HLS error', {
                type: errorData.type,
                details: errorData.details,
                fatal: errorData.fatal,
                url: errorData.url,
                responseCode: errorData.response?.code,
                currentTime: video.currentTime,
                codecUnparsable,
              });

              // Attempt media error recovery before giving up
              if (errorData.type === 'mediaError' && errorData.fatal) {
                if (mediaErrorRecoveryRef.current < MAX_MEDIA_ERROR_RECOVERIES) {
                  mediaErrorRecoveryRef.current++;
                  logVideo('hls_media_recovery', 'Attempting HLS media error recovery', {
                    attempt: mediaErrorRecoveryRef.current,
                    maxAttempts: MAX_MEDIA_ERROR_RECOVERIES,
                    details: errorData.details,
                  });
                  hls.recoverMediaError();
                  return;
                }
                // Try detach+reattach as last resort before giving up
                if (!reattachAttemptedRef.current) {
                  reattachAttemptedRef.current = true;
                  logVideo('hls_reattach', 'Attempting HLS detach+reattach after media error exhaustion', {
                    src,
                    details: errorData.details,
                  });
                  hls.destroy();
                  hlsRef.current = null;
                  // Re-trigger loadHLS after a short delay
                  setTimeout(() => loadHLS(), 500);
                  return;
                }
              }

              if (errorData.fatal) {
                onError?.({
                  type: errorData.type,
                  details: errorData.details,
                  fatal: true,
                  url: errorData.url,
                  responseCode: errorData.response?.code,
                  codecUnparsable,
                  currentTime: video.currentTime,
                });
                // Stop attempting recovery for fatal errors to avoid loops; surface to UI instead.
                hls.destroy();
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = shouldProxy ? toProxyUrl(src) : src;
            logVideo('hls_native', 'Using native HLS support', { proxied: shouldProxy });
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
    }, [src, shouldProxy]);

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
        disablePictureInPicture={!isHost}
        crossOrigin="anonymous"
      />
    );
  }
);

HLSPlayer.displayName = 'HLSPlayer';

export { HLSPlayer };
