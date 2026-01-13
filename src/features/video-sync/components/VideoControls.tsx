'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Maximize,
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Loader2,
  MessageCircle,
  Cast,
} from 'lucide-react';
import { SubtitleManager } from '@/src/features/subtitles/components';
import type { SubtitleTrack } from '@/types/schemas';
import { logVideo } from '@/src/core/logger/client-logger';
import { CastPlayerRef } from '@/src/features/media/cast';

interface VideoControlsProps {
  videoRef: React.RefObject<HTMLVideoElement> | null;
  castPlayerRef?: React.RefObject<CastPlayerRef | null>;
  isHost?: boolean;
  isLoading?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (time: number) => void;
  onShowChatOverlay?: () => void;
  subtitleTracks?: SubtitleTrack[];
  activeSubtitleTrack?: string;
  onAddSubtitleTracks?: (tracks: SubtitleTrack[]) => void;
  onRemoveSubtitleTrack?: (trackId: string) => void;
  onActiveSubtitleTrackChange?: (trackId?: string) => void;
  currentVideoTitle?: string;
  className?: string;
  onControlsVisibilityChange?: (visible: boolean) => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  // Cast controls
  isCasting?: boolean;
  isCastAvailable?: boolean;
  castDeviceName?: string;
  onCastClick?: () => void;
}

export function VideoControls({
  videoRef,
  castPlayerRef,
  isHost = false,
  isLoading = false,
  onPlay,
  onPause,
  onSeek,
  onShowChatOverlay,
  subtitleTracks = [],
  activeSubtitleTrack,
  onAddSubtitleTracks,
  onRemoveSubtitleTrack,
  onActiveSubtitleTrackChange,
  currentVideoTitle,
  className,
  onControlsVisibilityChange,
  onFullscreenChange,
  isCasting = false,
  isCastAvailable = false,
  castDeviceName,
  onCastClick,
}: VideoControlsProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true); // Start with controls visible
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const programmaticActionRef = useRef(false);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle client-side hydration and initial control visibility
  useEffect(() => {
    setShowControls(true);
    onControlsVisibilityChange?.(true);

    // Start the auto-hide timer on mount
    const timeout = setTimeout(() => {
      setShowControls(false);
      onControlsVisibilityChange?.(false);
    }, 4000); // Give a bit more time initially

    hideControlsTimeoutRef.current = timeout;
  }, [onControlsVisibilityChange]);

  const showControlsWithAutoHide = useCallback(() => {
    setShowControls(true);
    onControlsVisibilityChange?.(true);

    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }

    // Auto-hide controls after 3 seconds of inactivity
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
      onControlsVisibilityChange?.(false);
    }, 3000);
  }, [onControlsVisibilityChange]);

  // Handle fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
        (document as Document & { msFullscreenElement?: Element }).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
      onFullscreenChange?.(isCurrentlyFullscreen);

      // Show controls when entering/exiting fullscreen
      if (isCurrentlyFullscreen !== isFullscreen) {
        showControlsWithAutoHide();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen, onFullscreenChange, showControlsWithAutoHide]);

  // Poll cast player state when casting (can't use DOM events)
  useEffect(() => {
    if (!isCasting || !castPlayerRef?.current) return;

    // Initialize state from cast player
    setCurrentTime(castPlayerRef.current.getCurrentTime());
    setDuration(castPlayerRef.current.getDuration());
    setIsPlaying(!castPlayerRef.current.isPaused());

    const interval = setInterval(() => {
      if (!castPlayerRef.current) return;

      if (!isDragging) {
        setCurrentTime(castPlayerRef.current.getCurrentTime());
      }
      setDuration(castPlayerRef.current.getDuration());
      setIsPlaying(!castPlayerRef.current.isPaused());
    }, 500);

    return () => clearInterval(interval);
  }, [isCasting, castPlayerRef, isDragging]);

  // DOM video event listeners (skip when casting)
  useEffect(() => {
    // Don't attach DOM listeners when casting
    if (isCasting) return;

    const video = videoRef?.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handleTimeUpdate = () => {
      if (!isDragging) {
        setCurrentTime(video.currentTime);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleVolumeChange = () => {
      setIsMuted(video.muted);
    };

    const handleLoadStart = () => {
      setIsVideoLoading(true);
    };

    const handleCanPlay = () => {
      setIsVideoLoading(false);
    };

    const handleWaiting = () => {
      setIsVideoLoading(true);
    };

    const handlePlaying = () => {
      setIsVideoLoading(false);
    };

    const handleLoadedData = () => {
      setIsVideoLoading(false);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('loadeddata', handleLoadedData);

    // Initialize state
    setIsPlaying(!video.paused);
    setIsMuted(video.muted);
    setDuration(video.duration || 0);
    setCurrentTime(video.currentTime || 0);
    setIsVideoLoading(video.readyState < 3);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [videoRef, isDragging, isCasting]);

  useEffect(() => {
    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, []);

  // Don't render if no video ref and no cast player
  if (!videoRef && !isCasting && !castPlayerRef?.current) {
    return null;
  }

  const handleFullscreen = () => {
    // Check if we're currently in fullscreen mode
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement ||
      (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
      (document as Document & { msFullscreenElement?: Element }).msFullscreenElement
    );

    if (isCurrentlyFullscreen) {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen) {
        (document as Document & { webkitExitFullscreen: () => void }).webkitExitFullscreen();
      } else if ((document as Document & { msExitFullscreen?: () => void }).msExitFullscreen) {
        (document as Document & { msExitFullscreen: () => void }).msExitFullscreen();
      }
    } else {
      // Enter fullscreen
      const videoContainer = videoRef?.current?.closest('[data-video-container]') as HTMLElement;

      if (videoContainer) {
        if (videoContainer.requestFullscreen) {
          videoContainer.requestFullscreen();
        } else if ((videoContainer as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen) {
          (videoContainer as HTMLElement & { webkitRequestFullscreen: () => void }).webkitRequestFullscreen();
        } else if ((videoContainer as HTMLElement & { msRequestFullscreen?: () => void }).msRequestFullscreen) {
          (videoContainer as HTMLElement & { msRequestFullscreen: () => void }).msRequestFullscreen();
        }
      } else if (videoRef?.current) {
        // Fallback to video element if container not found
        if (videoRef.current.requestFullscreen) {
          videoRef.current.requestFullscreen();
        } else if (
          (videoRef.current as HTMLVideoElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen
        ) {
          (videoRef.current as HTMLVideoElement & { webkitRequestFullscreen: () => void }).webkitRequestFullscreen();
        } else if ((videoRef.current as HTMLVideoElement & { msRequestFullscreen?: () => void }).msRequestFullscreen) {
          (videoRef.current as HTMLVideoElement & { msRequestFullscreen: () => void }).msRequestFullscreen();
        }
      }
    }
  };

  const handleMuteToggle = () => {
    if (videoRef?.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const handlePlayPause = () => {
    // Handle casting
    if (isCasting && castPlayerRef?.current) {
      programmaticActionRef.current = false;

      if (isPlaying) {
        castPlayerRef.current.pause();
        onPause?.();
      } else {
        castPlayerRef.current.play();
        onPlay?.();
      }
      return;
    }

    // Handle local video
    if (!videoRef?.current) return;

    programmaticActionRef.current = false;

    if (isPlaying) {
      videoRef.current.pause();
      onPause?.();
    } else {
      // Check if video has supported sources before attempting to play
      const video = videoRef.current;
      if (!video.src && video.children.length === 0) {
        logVideo('controls_no_source', 'No video source available');
        return;
      }

      video.play().catch(error => {
        logVideo('controls_play_failed', 'Video play failed', { error });

        // Handle specific error types
        if (error.name === 'NotSupportedError') {
          logVideo('controls_error_detail', 'Video format not supported or source unavailable');
        } else if (error.name === 'NotAllowedError') {
          logVideo('controls_error_detail', 'Video play blocked by browser policy');
        } else if (error.name === 'AbortError') {
          logVideo('controls_error_detail', 'Video play aborted');
        }
      });
      onPlay?.();
    }
  };

  const handleSeekBackward = () => {
    // Handle casting
    if (isCasting && castPlayerRef?.current) {
      const newTime = Math.max(0, castPlayerRef.current.getCurrentTime() - 10);
      castPlayerRef.current.seekTo(newTime);
      onSeek?.(newTime);
      return;
    }

    // Handle local video
    if (!videoRef?.current) return;

    const newTime = Math.max(0, videoRef.current.currentTime - 10);
    videoRef.current.currentTime = newTime;
    onSeek?.(newTime);
  };

  const handleSeekForward = () => {
    // Handle casting
    if (isCasting && castPlayerRef?.current) {
      const newTime = Math.min(duration, castPlayerRef.current.getCurrentTime() + 10);
      castPlayerRef.current.seekTo(newTime);
      onSeek?.(newTime);
      return;
    }

    // Handle local video
    if (!videoRef?.current) return;

    const newTime = Math.min(duration, videoRef.current.currentTime + 10);
    videoRef.current.currentTime = newTime;
    onSeek?.(newTime);
  };

  const handleSliderMouseDown = (e: React.MouseEvent) => {
    if (!isHost || !sliderRef.current) return;
    // Need either a video ref or cast player
    if (!isCasting && !videoRef?.current) return;

    setIsDragging(true);
    handleSliderMove(e, false); // Don't emit seek during drag

    const handleMouseMove = (e: MouseEvent) => {
      // Create a synthetic event-like object for handleSliderMove
      const syntheticEvent = {
        clientX: e.clientX,
        currentTarget: sliderRef.current,
        preventDefault: () => e.preventDefault(),
      } as React.MouseEvent<HTMLDivElement>;
      handleSliderMove(syntheticEvent, false); // Don't emit seek during drag
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsDragging(false);
      // Emit seek only on drag end
      const syntheticEvent = {
        clientX: e.clientX,
        currentTarget: sliderRef.current,
        preventDefault: () => e.preventDefault(),
      } as React.MouseEvent<HTMLDivElement>;
      handleSliderMove(syntheticEvent, true); // Emit seek on mouseup
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleSliderMove = (e: React.MouseEvent | MouseEvent, emitSeek = true) => {
    if (!sliderRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const percentage = x / rect.width;
    const newTime = percentage * duration;

    setCurrentTime(newTime);

    // Apply seek to player
    if (isCasting && castPlayerRef?.current) {
      castPlayerRef.current.seekTo(newTime);
    } else if (videoRef?.current) {
      videoRef.current.currentTime = newTime;
    }

    // Only emit seek event on drag end to reduce network chatter
    if (emitSeek) {
      onSeek?.(newTime);
    }
  };

  const formatTime = (time: number) => {
    if (!isFinite(time)) return '0:00';

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = () => {
    showControlsWithAutoHide();
  };

  const handleMouseLeave = () => {
    // Don't immediately hide controls on mouse leave, allow inactivity timer to handle it
    if (hideControlsTimeoutRef.current) clearTimeout(hideControlsTimeoutRef.current);
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
      onControlsVisibilityChange?.(false);
    }, 2000);
  };
  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleVideoClick = (e: React.MouseEvent) => {
    // Only allow host to click to play/pause
    if (!isHost) return;

    // Disable click-to-play/pause on mobile devices
    const isMobile = window.innerWidth < 768 || 'ontouchstart' in window;
    if (isMobile) return;

    // Only trigger play/pause if user clicked directly on the backdrop layer
    if (e.target !== e.currentTarget) return;

    handlePlayPause();
  };

  return (
    <div
      className={`absolute inset-0 ${className} ${isFullscreen && !showControls ? 'cursor-none' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={showControlsWithAutoHide}
      onClick={handleVideoClick}
    >
      {/* Loading indicator for guests */}
      {!isHost && isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex items-center space-x-2 rounded-lg bg-black/70 px-4 py-2 text-white">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Getting on the same page...</span>
          </div>
        </div>
      )}

      {/* Video loading indicator */}
      {isVideoLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-primary/20 p-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-x-0 bottom-0 transition-opacity duration-200 ${
          isFullscreen
            ? 'bg-gradient-to-t from-black/90 to-transparent p-6'
            : 'bg-gradient-to-t from-black/70 to-transparent p-4'
        } ${showControls ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Host seek bar */}
        {isHost && (
          <div className={isFullscreen ? 'mb-6' : 'mb-4'}>
            <div
              ref={sliderRef}
              className={`seek-slider group relative cursor-pointer rounded-full bg-border transition-interactive hover:bg-white/30 ${
                isFullscreen ? 'h-3' : 'h-2'
              }`}
              onMouseDown={handleSliderMouseDown}
            >
              {/* Progress bar */}
              <div
                className="h-full rounded-full bg-primary shadow-sm duration-100 transition-interactive"
                style={{ width: `${progressPercentage}%` }}
              />

              {/* Slider handle */}
              <div
                className={`absolute top-1/2 -translate-y-1/2 rounded-full border-2 border-primary-foreground bg-primary opacity-0 shadow-lg transition-interactive hover:scale-110 group-hover:opacity-100 ${
                  isFullscreen ? 'h-5 w-5' : 'h-4 w-4'
                }`}
                style={{ left: `calc(${progressPercentage}% - ${isFullscreen ? '10px' : '8px'})` }}
              />
            </div>

            {/* Time display */}
            <div
              className={`mt-2 flex justify-between font-mono text-primary-foreground ${isFullscreen ? 'text-sm' : 'text-xs'}`}
            >
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        )}

        {/* Control buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {/* Host play/pause and seek controls */}
            {isHost && (
              <>
                <Button
                  variant="secondary"
                  size={isFullscreen ? 'default' : 'sm'}
                  onClick={handleSeekBackward}
                  className={`${isFullscreen ? 'h-11 w-11' : 'h-9 w-9'} border border-border bg-black/60 p-0 text-primary-foreground transition-interactive hover:border-primary hover:bg-primary hover:text-primary-foreground`}
                  title="Seek backward 10s"
                >
                  <RotateCcw className={isFullscreen ? 'h-5 w-5' : 'h-4 w-4'} />
                </Button>

                <Button
                  variant="secondary"
                  size={isFullscreen ? 'default' : 'sm'}
                  onClick={handlePlayPause}
                  className={`${isFullscreen ? 'h-11 w-11' : 'h-9 w-9'} bg-primary p-0 text-primary-foreground shadow-lg transition-interactive hover:scale-105 hover:bg-primary/80 hover:shadow-primary/25`}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className={isFullscreen ? 'h-5 w-5' : 'h-4 w-4'} />
                  ) : (
                    <Play className={isFullscreen ? 'h-5 w-5' : 'h-4 w-4'} />
                  )}
                </Button>

                <Button
                  variant="secondary"
                  size={isFullscreen ? 'default' : 'sm'}
                  onClick={handleSeekForward}
                  className={`${isFullscreen ? 'h-11 w-11' : 'h-9 w-9'} border border-border bg-black/60 p-0 text-primary-foreground transition-interactive hover:border-primary hover:bg-primary hover:text-primary-foreground`}
                  title="Seek forward 10s"
                >
                  <RotateCw className={isFullscreen ? 'h-5 w-5' : 'h-4 w-4'} />
                </Button>
              </>
            )}
          </div>

          {/* Common controls (mute, chat, and fullscreen) */}
          <div className="flex items-center space-x-2">
            <Button
              variant="secondary"
              size={isFullscreen ? 'default' : 'sm'}
              disabled={isCasting}
              onClick={handleMuteToggle}
              className={`${isFullscreen ? 'h-11 w-11' : 'h-9 w-9'} border border-border p-0 duration-200 transition-interactive ${
                isMuted
                  ? 'border-0 bg-destructive-100 text-destructive-800'
                  : 'bg-black/60 text-primary-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? (
                <VolumeX className={isFullscreen ? 'h-5 w-5' : 'h-4 w-4'} />
              ) : (
                <Volume2 className={isFullscreen ? 'h-5 w-5' : 'h-4 w-4'} />
              )}
            </Button>

            {/* Subtitle Controls */}
            {onAddSubtitleTracks && onActiveSubtitleTrackChange && (
              <SubtitleManager
                subtitleTracks={subtitleTracks}
                activeTrackId={activeSubtitleTrack}
                onAddTracks={onAddSubtitleTracks}
                onRemoveTrack={onRemoveSubtitleTrack || (() => {})}
                onActiveTrackChange={onActiveSubtitleTrackChange}
                currentVideoTitle={currentVideoTitle}
                isHost={isHost}
                isFullscreen={isFullscreen}
              />
            )}

            {/* Chat button - only show in fullscreen */}
            {isFullscreen && onShowChatOverlay && (
              <Button
                variant="secondary"
                size="default"
                onClick={onShowChatOverlay}
                className="h-11 w-11 border border-border bg-black/60 p-0 text-white duration-200 transition-interactive hover:border-primary hover:bg-primary hover:text-primary-foreground"
                title="Show chat"
              >
                <MessageCircle className="h-5 w-5" />
              </Button>
            )}

            {/* Cast button - only show if Cast is available */}
            {isCastAvailable && onCastClick && (
              <Button
                variant="secondary"
                size={isFullscreen ? 'default' : 'sm'}
                onClick={onCastClick}
                className={`${isFullscreen ? 'h-11 w-11' : 'h-9 w-9'} border p-0 duration-200 transition-interactive ${
                  isCasting
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-black/60 text-white hover:border-primary hover:bg-primary hover:text-primary-foreground'
                }`}
                title={isCasting ? `Casting to ${castDeviceName || 'TV'}` : 'Cast to TV'}
              >
                <Cast className={isFullscreen ? 'h-5 w-5' : 'h-4 w-4'} />
              </Button>
            )}

            <Button
              variant="secondary"
              size={isFullscreen ? 'default' : 'sm'}
              disabled={isCasting}
              onClick={handleFullscreen}
              className={`${isFullscreen ? 'h-11 w-11' : 'h-9 w-9'} border border-border bg-black/60 p-0 text-white duration-200 transition-interactive hover:border-primary hover:bg-primary hover:text-primary-foreground`}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              <Maximize className={isFullscreen ? 'h-5 w-5' : 'h-4 w-4'} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
