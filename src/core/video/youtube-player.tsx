'use client';

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

interface YouTubePlayerProps {
  videoId: string;
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  className?: string;
}

export interface YouTubePlayerRef {
  play: () => void;
  pause: () => void;
  seekTo: (time: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
}

// YouTube IFrame Player API states
export const YT_STATES = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};

declare global {
  interface Window {
    YT: {
      Player: new (element: string | HTMLElement, config: Record<string, unknown>) => YTPlayer;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}

export const YouTubePlayer = forwardRef<YouTubePlayerRef, YouTubePlayerProps>(
  ({ videoId, onReady, onStateChange, onTimeUpdate, className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<YTPlayer | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useImperativeHandle(ref, () => ({
      play: () => {
        if (playerRef.current && playerRef.current.playVideo) {
          playerRef.current.playVideo();
        }
      },
      pause: () => {
        if (playerRef.current && playerRef.current.pauseVideo) {
          playerRef.current.pauseVideo();
        }
      },
      seekTo: (time: number) => {
        if (playerRef.current && playerRef.current.seekTo) {
          playerRef.current.seekTo(time, true);
        }
      },
      getCurrentTime: () => {
        if (playerRef.current && playerRef.current.getCurrentTime) {
          return playerRef.current.getCurrentTime();
        }
        return 0;
      },
      getDuration: () => {
        if (playerRef.current && playerRef.current.getDuration) {
          return playerRef.current.getDuration();
        }
        return 0;
      },
      getPlayerState: () => {
        if (playerRef.current && playerRef.current.getPlayerState) {
          return playerRef.current.getPlayerState();
        }
        return YT_STATES.UNSTARTED;
      },
    }));

    useEffect(() => {
      const loadYouTubeAPI = () => {
        if (window.YT && window.YT.Player) {
          initializePlayer();
          return;
        }

        // Load YouTube IFrame API
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

        window.onYouTubeIframeAPIReady = initializePlayer;
      };

      const initializePlayer = () => {
        if (!containerRef.current || !videoId) return;

        // Clear existing player
        if (playerRef.current) {
          playerRef.current.destroy();
        }

        playerRef.current = new window.YT.Player(containerRef.current, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 1,
            disablekb: 0,
            enablejsapi: 1,
            fs: 1,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              onReady?.();
              startTimeTracking();
            },
            onStateChange: (event: { data: number; target: YTPlayer }) => {
              onStateChange?.(event.data);

              if (event.data === YT_STATES.PLAYING) {
                startTimeTracking();
              } else {
                stopTimeTracking();
              }
            },
          },
        });
      };

      const startTimeTracking = () => {
        stopTimeTracking();
        intervalRef.current = setInterval(() => {
          if (playerRef.current && onTimeUpdate) {
            const currentTime = playerRef.current.getCurrentTime();
            const duration = playerRef.current.getDuration();
            onTimeUpdate(currentTime, duration);
          }
        }, 1000);
      };

      const stopTimeTracking = () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };

      loadYouTubeAPI();

      return () => {
        stopTimeTracking();
        if (playerRef.current) {
          playerRef.current.destroy();
        }
      };
    }, [videoId, onReady, onStateChange, onTimeUpdate]);

    return (
      <div className={className}>
        <div ref={containerRef} className="h-full w-full" />
      </div>
    );
  }
);

YouTubePlayer.displayName = 'YouTubePlayer';
