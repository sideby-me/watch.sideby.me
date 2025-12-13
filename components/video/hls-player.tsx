'use client';

import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';

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
  onError?: (info: { type?: string; details?: string; fatal?: boolean; url?: string; responseCode?: number }) => void;
  className?: string;
  isHost?: boolean;
  useProxy?: boolean;
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
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<{ destroy: () => void } | null>(null);
    const programmaticActionRef = useRef(false);
    const proxyTriedRef = useRef<boolean>(!!useProxy);
    const [shouldProxy, setShouldProxy] = useState<boolean>(!!useProxy);

    useImperativeHandle(ref, () => ({
      play: async () => {
        if (videoRef.current) {
          try {
            programmaticActionRef.current = true;
            await videoRef.current.play();
          } catch (error) {
            console.error('Error playing HLS video:', error);
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

      // Check if HLS.js is supported
      const loadHLS = async () => {
        try {
          // Dynamically import HLS.js
          const { default: Hls } = await import('hls.js');

          const toProxyUrl = (target: string) => {
            if (!shouldProxy) return target;
            if (target.startsWith('/api/video-proxy') || target.includes('/api/video-proxy?')) {
              return target;
            }
            try {
              const absolute = new URL(target, window.location.origin).toString();
              return `/api/video-proxy?url=${encodeURIComponent(absolute)}`;
            } catch {
              return `/api/video-proxy?url=${encodeURIComponent(target)}`;
            }
          };

          if (Hls.isSupported()) {
            // Use HLS.js for browsers that don't support HLS natively
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
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
              console.log('📺 HLS manifest loaded');
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
              if (isBufferStall) return;

              const networkish =
                errorData.type === 'networkError' ||
                errorData.details === 'fragLoadError' ||
                errorData.details === 'manifestLoadError';

              const willRetryViaProxy = !shouldProxy && networkish && !proxyTriedRef.current;
              if (willRetryViaProxy) {
                proxyTriedRef.current = true;
                setShouldProxy(true);
                hls.destroy();
                return;
              }
              console.error('HLS error:', data);

              if (errorData.fatal) {
                onError?.({
                  type: errorData.type,
                  details: errorData.details,
                  fatal: true,
                  url: errorData.url,
                  responseCode: errorData.response?.code,
                });
                // Stop attempting recovery for fatal errors to avoid loops; surface to UI instead.
                hls.destroy();
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = shouldProxy ? toProxyUrl(src) : src;
            console.log('📺 Using native HLS support', { proxied: shouldProxy });
          } else {
            console.error('HLS is not supported in this browser');
          }
        } catch (error) {
          console.error('Failed to load HLS.js:', error);
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
      console.log('🎬 HLS video started playing', { programmatic: programmaticActionRef.current, isHost });
      // Only emit if this is a user action (not programmatic) and user is host
      if (!programmaticActionRef.current && isHost) {
        onPlay?.();
      }
      programmaticActionRef.current = false;
    };

    const handlePause = () => {
      console.log('⏸️ HLS video paused', { programmatic: programmaticActionRef.current, isHost });
      // Only emit if this is a user action (not programmatic) and user is host
      if (!programmaticActionRef.current && isHost) {
        onPause?.();
      }
      programmaticActionRef.current = false;
    };

    const handleSeeked = () => {
      console.log('🎯 HLS video seeked to:', videoRef.current?.currentTime, {
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
      console.log('📊 HLS video metadata loaded');
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
      />
    );
  }
);

HLSPlayer.displayName = 'HLSPlayer';

export { HLSPlayer };
