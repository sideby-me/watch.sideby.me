'use client';

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useVideoSubtitleTracks } from '@/src/features/subtitles/hooks';
import type { SubtitleTrack } from '@/types/schemas';
import { logVideo } from '@/src/core/logger/client-logger';

interface VideoPlayerProps {
  src: string;
  onReady?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onSeeked?: () => void;
  onError?: (info: { code?: number; message?: string; src: string; codecUnparsable?: boolean }) => void;
  className?: string;
  isHost?: boolean;
  subtitleTracks?: SubtitleTrack[];
  activeSubtitleTrack?: string;
}

export interface VideoPlayerRef {
  play: () => void;
  pause: () => void;
  seekTo: (time: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  isPaused: () => boolean;
  getVideoElement: () => HTMLVideoElement | null;
  debugSubtitles: () => void;
}

export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(
  (
    {
      src,
      onReady,
      onPlay,
      onPause,
      onTimeUpdate,
      onSeeked,
      onError,
      className,
      isHost = false,
      subtitleTracks = [],
      activeSubtitleTrack,
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const programmaticActionRef = useRef(false);

    // Use dedicated hook for subtitle track management
    const { debugSubtitles } = useVideoSubtitleTracks({
      videoElement: videoRef.current,
      subtitleTracks,
      activeSubtitleTrack,
    });

    useImperativeHandle(ref, () => ({
      play: () => {
        if (videoRef.current) {
          programmaticActionRef.current = true;
          videoRef.current.play().catch(error => logVideo('play_error', 'Video play failed', { error }));
        }
      },
      pause: () => {
        if (videoRef.current) {
          programmaticActionRef.current = true;
          videoRef.current.pause();
        }
      },
      seekTo: (time: number) => {
        if (videoRef.current) {
          programmaticActionRef.current = true;
          videoRef.current.currentTime = time;
        }
      },
      getCurrentTime: () => {
        return videoRef.current?.currentTime || 0;
      },
      getDuration: () => {
        return videoRef.current?.duration || 0;
      },
      isPaused: () => {
        return videoRef.current?.paused ?? true;
      },
      getVideoElement: () => {
        return videoRef.current;
      },
      debugSubtitles,
    }));

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const handleLoadedMetadata = () => {
        logVideo('video_metadata_loaded', 'Video metadata loaded', { duration: video.duration });
        onReady?.();
      };

      const handlePlay = () => {
        logVideo('video_play', 'Video play event', { programmatic: programmaticActionRef.current, isHost });
        // Only emit if this is a user action (not programmatic) and user is host
        if (!programmaticActionRef.current && isHost) {
          onPlay?.();
        }
        programmaticActionRef.current = false;
      };

      const handlePause = () => {
        logVideo('video_pause', 'Video pause event', { programmatic: programmaticActionRef.current, isHost });
        // Only emit if this is a user action (not programmatic) and user is host
        if (!programmaticActionRef.current && isHost) {
          onPause?.();
        }
        programmaticActionRef.current = false;
      };

      const handleTimeUpdate = () => {
        if (video && onTimeUpdate) {
          onTimeUpdate(video.currentTime, video.duration);
        }
      };

      const handleSeeked = () => {
        logVideo('video_seeked', 'Video seeked', {
          time: video.currentTime,
          programmatic: programmaticActionRef.current,
          isHost,
        });
        // Only emit if this is a user action (not programmatic) and user is host
        if (!programmaticActionRef.current && isHost) {
          onSeeked?.();
        }
        programmaticActionRef.current = false;
      };

      const handleError = () => {
        const error = video.error;
        logVideo('video_error', 'Video error', { error });

        if (error) {
          const errorMessages = {
            1: 'MEDIA_ERR_ABORTED - Video loading was aborted',
            2: 'MEDIA_ERR_NETWORK - Network error occurred while loading video',
            3: 'MEDIA_ERR_DECODE - Video decoding error',
            4: 'MEDIA_ERR_SRC_NOT_SUPPORTED - Video format not supported or source not found',
          };

          const errorMessage = errorMessages[error.code as keyof typeof errorMessages] || 'Unknown video error';

          const messageText = error.message || errorMessage;

          const codecUnparsable =
            error.code === 4 &&
            Boolean(
              messageText &&
                ['MEDIA_ELEMENT_ERROR', 'Format error', 'DEMUXER_ERROR', 'COULD_NOT_PARSE', 'decode'].some(token =>
                  messageText.toUpperCase().includes(token)
                )
            );

          logVideo('video_error_details', 'Video error details', {
            code: error.code,
            message: messageText,
            src: video.src,
            networkState: video.networkState,
            readyState: video.readyState,
            codecUnparsable,
          });

          // Notify container for potential fallback like proxy
          onError?.({ code: error.code, message: messageText, src: video.src, codecUnparsable });
        }
      };

      const handleCanPlay = () => {
        logVideo('video_canplay', 'Video can start playing');
      };

      const handleLoadStart = () => {
        logVideo('video_load_start', 'Video load started', { src: video.src });
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('seeked', handleSeeked);
      video.addEventListener('error', handleError);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('loadstart', handleLoadStart);

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('seeked', handleSeeked);
        video.removeEventListener('error', handleError);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('loadstart', handleLoadStart);
      };
    }, [onReady, onPlay, onPause, onTimeUpdate, onSeeked, onError, isHost]);

    return (
      <video
        ref={videoRef}
        src={src}
        controls={false} // Always use custom controls
        className={className}
        preload="metadata"
        playsInline
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture={!isHost}
        crossOrigin="anonymous"
      >
        Looks like your browser is a bit of a fossil! To watch videos here, you might need to update or switch to a
        newer browser like Chrome or Firefox.
      </video>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';
