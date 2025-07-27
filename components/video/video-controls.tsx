'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Maximize, Volume2, VolumeX, Play, Pause, SkipBack, SkipForward, Loader2 } from 'lucide-react';

interface VideoControlsProps {
  videoRef: React.RefObject<HTMLVideoElement> | null;
  isHost?: boolean;
  isLoading?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (time: number) => void;
  className?: string;
}

export function VideoControls({
  videoRef,
  isHost = false,
  isLoading = false,
  onPlay,
  onPause,
  onSeek,
  className,
}: VideoControlsProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true); // Start with controls visible
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const programmaticActionRef = useRef(false);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle client-side hydration and initial control visibility
  useEffect(() => {
    setIsClient(true);
    setShowControls(true); // Ensure controls are visible after hydration

    // Start the auto-hide timer on mount
    const timeout = setTimeout(() => {
      setShowControls(false);
    }, 4000); // Give a bit more time initially

    hideControlsTimeoutRef.current = timeout;
  }, []); // Update video state
  useEffect(() => {
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

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('volumechange', handleVolumeChange);

    // Initialize state
    setIsPlaying(!video.paused);
    setIsMuted(video.muted);
    setDuration(video.duration || 0);
    setCurrentTime(video.currentTime || 0);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('volumechange', handleVolumeChange);
    };
  }, [videoRef, isDragging]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, []);

  // Don't render if no video ref
  if (!videoRef) {
    return null;
  }

  const handleFullscreen = () => {
    if (videoRef?.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if ((videoRef.current as any).webkitRequestFullscreen) {
        (videoRef.current as any).webkitRequestFullscreen();
      } else if ((videoRef.current as any).msRequestFullscreen) {
        (videoRef.current as any).msRequestFullscreen();
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
    if (!videoRef?.current) return;

    programmaticActionRef.current = false; // This is user action

    if (isPlaying) {
      videoRef.current.pause();
      onPause?.();
    } else {
      videoRef.current.play().catch(console.error);
      onPlay?.();
    }
  };

  const handleSeekBackward = () => {
    if (!videoRef?.current) return;

    const newTime = Math.max(0, videoRef.current.currentTime - 10);
    videoRef.current.currentTime = newTime;
    onSeek?.(newTime);
  };

  const handleSeekForward = () => {
    if (!videoRef?.current) return;

    const newTime = Math.min(duration, videoRef.current.currentTime + 10);
    videoRef.current.currentTime = newTime;
    onSeek?.(newTime);
  };

  const handleSliderMouseDown = (e: React.MouseEvent) => {
    if (!isHost || !sliderRef.current || !videoRef?.current) return;

    setIsDragging(true);
    handleSliderMove(e);

    const handleMouseMove = (e: MouseEvent) => {
      handleSliderMove(e as any);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleSliderMove = (e: React.MouseEvent | MouseEvent) => {
    if (!sliderRef.current || !videoRef?.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const percentage = x / rect.width;
    const newTime = percentage * duration;

    setCurrentTime(newTime);
    videoRef.current.currentTime = newTime;
    onSeek?.(newTime);
  };

  const formatTime = (time: number) => {
    if (!isFinite(time)) return '0:00';

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const showControlsWithAutoHide = () => {
    setShowControls(true);

    // Clear existing timeout
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }

    // Auto-hide controls after 3 seconds of inactivity
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  const handleMouseMove = () => {
    showControlsWithAutoHide();
  };

  const handleMouseLeave = () => {
    // Clear timeout and hide controls when mouse leaves
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    setShowControls(false);
  };
  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`absolute inset-0 ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={showControlsWithAutoHide}
    >
      {/* Loading indicator for guests */}
      {!isHost && isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex items-center space-x-2 rounded-lg bg-black/70 px-4 py-2 text-white">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Host seek bar */}
        {isHost && (
          <div className="mb-4">
            <div
              ref={sliderRef}
              className="group relative h-2 cursor-pointer rounded-full bg-white/30"
              onMouseDown={handleSliderMouseDown}
            >
              {/* Progress bar */}
              <div
                className="h-full rounded-full bg-white transition-all duration-100"
                style={{ width: `${progressPercentage}%` }}
              />

              {/* Slider handle */}
              <div
                className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white opacity-0 transition-opacity group-hover:opacity-100"
                style={{ left: `calc(${progressPercentage}% - 8px)` }}
              />
            </div>

            {/* Time display */}
            <div className="mt-1 flex justify-between text-xs text-white/80">
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
                  size="sm"
                  onClick={handleSeekBackward}
                  className="h-8 w-8 bg-black/70 p-0 text-white hover:bg-black/90"
                  title="Seek backward 10s"
                >
                  <SkipBack className="h-4 w-4" />
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handlePlayPause}
                  className="h-8 w-8 bg-black/70 p-0 text-white hover:bg-black/90"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSeekForward}
                  className="h-8 w-8 bg-black/70 p-0 text-white hover:bg-black/90"
                  title="Seek forward 10s"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>

          {/* Common controls (mute and fullscreen) */}
          <div className="flex items-center space-x-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleMuteToggle}
              className="h-8 w-8 bg-black/70 p-0 text-white hover:bg-black/90"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleFullscreen}
              className="h-8 w-8 bg-black/70 p-0 text-white hover:bg-black/90"
              title="Fullscreen"
            >
              <Maximize className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
