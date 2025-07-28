import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { YouTubePlayer, YouTubePlayerRef } from '@/components/video/youtube-player';
import { VideoPlayer, VideoPlayerRef } from '@/components/video/video-player';
import { HLSPlayer, HLSPlayerRef } from '@/components/video/hls-player';
import { VideoControls } from '@/components/video/video-controls';
import { SubtitleOverlay } from '@/components/video/subtitle-overlay';
import { Video, ExternalLink, Edit3, AlertTriangle } from 'lucide-react';
import type { SubtitleTrack } from '@/types/schemas';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseVideoUrl } from '@/lib/video-utils';
import { toast } from 'sonner';

interface VideoPlayerContainerProps {
  videoUrl: string;
  videoType: 'youtube' | 'mp4' | 'm3u8';
  videoId?: string;
  isHost: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeeked: () => void;
  onYouTubeStateChange: (state: number) => void;
  onControlAttempt: () => void;
  onVideoChange?: (url: string) => void;
  onShowChatOverlay?: () => void;
  subtitleTracks?: SubtitleTrack[];
  activeSubtitleTrack?: string;
  onAddSubtitleTracks?: (tracks: SubtitleTrack[]) => void;
  onRemoveSubtitleTrack?: (trackId: string) => void;
  onActiveSubtitleTrackChange?: (trackId?: string) => void;
  currentVideoTitle?: string;
  youtubePlayerRef: React.RefObject<YouTubePlayerRef | null>;
  videoPlayerRef: React.RefObject<VideoPlayerRef | null>;
  hlsPlayerRef: React.RefObject<HLSPlayerRef | null>;
}

export function VideoPlayerContainer({
  videoUrl,
  videoType,
  videoId,
  isHost,
  onPlay,
  onPause,
  onSeeked,
  onYouTubeStateChange,
  onControlAttempt,
  onVideoChange,
  onShowChatOverlay,
  subtitleTracks = [],
  activeSubtitleTrack,
  onAddSubtitleTracks,
  onRemoveSubtitleTrack,
  onActiveSubtitleTrackChange,
  currentVideoTitle,
  youtubePlayerRef,
  videoPlayerRef,
  hlsPlayerRef,
}: VideoPlayerContainerProps) {
  const [isChangeDialogOpen, setIsChangeDialogOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingUrl, setPendingUrl] = useState('');
  const [videoRefReady, setVideoRefReady] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true); // Start with controls visible
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Check if video ref is ready
  useEffect(() => {
    const checkVideoRef = () => {
      if (videoType === 'mp4' && videoPlayerRef.current) {
        setVideoRefReady(true);
      } else if (videoType === 'm3u8' && hlsPlayerRef.current) {
        setVideoRefReady(true);
      } else {
        setVideoRefReady(false);
      }
    };

    // Check immediately
    checkVideoRef();

    // Set up interval to check periodically
    const interval = setInterval(checkVideoRef, 100);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoType]);

  // Get video element ref for guest controls
  const getVideoElementRef = () => {
    if (videoType === 'mp4' && videoPlayerRef.current) {
      const videoElement = videoPlayerRef.current.getVideoElement();
      return videoElement ? { current: videoElement } : null;
    }
    if (videoType === 'm3u8' && hlsPlayerRef.current) {
      const videoElement = hlsPlayerRef.current.getVideoElement();
      return videoElement ? { current: videoElement } : null;
    }
    return null;
  };

  const getVideoTypeName = () => {
    switch (videoType) {
      case 'youtube':
        return 'YouTube';
      case 'm3u8':
        return 'HLS Stream';
      default:
        return 'Video File';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newUrl.trim()) {
      setError('Please enter a video URL');
      return;
    }

    const parsed = parseVideoUrl(newUrl.trim());
    if (!parsed) {
      setError('Please enter a valid YouTube, MP4, or M3U8 video URL');
      return;
    }

    setPendingUrl(newUrl.trim());
    setShowConfirmation(true);
  };

  const handleChangeVideoClick = () => {
    if (!newUrl.trim()) {
      setError('Please enter a video URL');
      return;
    }

    const parsed = parseVideoUrl(newUrl.trim());
    if (!parsed) {
      setError('Please enter a valid YouTube, MP4, or M3U8 video URL');
      return;
    }

    setPendingUrl(newUrl.trim());
    setShowConfirmation(true);
  };

  const executeVideoChange = () => {
    if (!onVideoChange) return;

    setIsLoading(true);
    setError('');

    onVideoChange(pendingUrl);

    setTimeout(() => {
      toast.success('Video changed successfully!', {
        description: `Now playing: ${getVideoTypeDisplayName(pendingUrl)}`,
      });

      setNewUrl('');
      setIsLoading(false);
      setIsChangeDialogOpen(false);
      setShowConfirmation(false);
      setPendingUrl('');
    }, 500);
  };

  const handleConfirmChange = () => {
    executeVideoChange();
  };

  const handleCancelChange = () => {
    setShowConfirmation(false);
    setPendingUrl('');
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsChangeDialogOpen(open);
    if (!open) {
      // Reset form when dialog closes
      setNewUrl('');
      setError('');
      setShowConfirmation(false);
      setPendingUrl('');
    }
  };

  const getVideoTypeDisplayName = (url: string) => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return 'YouTube';
    }
    return 'Video File';
  };

  // Add scroll lock behavior like host-control-dialog
  useEffect(() => {
    if (isChangeDialogOpen) {
      // Get current scrollbar width
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      // Temporarily add padding to prevent layout shift
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      // Remove padding when modal closes
      document.body.style.paddingRight = '';
    }

    return () => {
      // Cleanup on unmount
      document.body.style.paddingRight = '';
    };
  }, [isChangeDialogOpen]);

  const renderPlayer = () => {
    switch (videoType) {
      case 'youtube':
        return (
          <YouTubePlayer
            ref={youtubePlayerRef}
            videoId={videoId || ''}
            onStateChange={onYouTubeStateChange}
            className="h-full w-full"
          />
        );
      case 'm3u8':
        return (
          <HLSPlayer
            ref={hlsPlayerRef}
            src={videoUrl}
            onPlay={onPlay}
            onPause={onPause}
            onSeeked={onSeeked}
            isHost={isHost}
            className="h-full w-full"
          />
        );
      default:
        return (
          <VideoPlayer
            ref={videoPlayerRef}
            src={videoUrl}
            onPlay={onPlay}
            onPause={onPause}
            onSeeked={onSeeked}
            isHost={isHost}
            subtitleTracks={subtitleTracks}
            activeSubtitleTrack={activeSubtitleTrack}
            className="h-full w-full"
          />
        );
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div
          className={`relative aspect-video overflow-hidden rounded-lg bg-black ${
            controlsVisible ? 'video-container-with-controls' : ''
          } ${isFullscreen ? 'video-container-fullscreen' : ''}`}
          data-video-container
        >
          {renderPlayer()}

          {/* Custom subtitle overlay for non-YouTube videos */}
          {videoType !== 'youtube' && (
            <SubtitleOverlay
              videoRef={getVideoElementRef()}
              subtitleTracks={subtitleTracks}
              activeSubtitleTrack={activeSubtitleTrack}
              controlsVisible={controlsVisible}
              isFullscreen={isFullscreen}
            />
          )}

          {/* Unified video controls for non-YouTube videos */}
          {videoType !== 'youtube' && videoRefReady && (
            <VideoControls
              videoRef={getVideoElementRef()}
              isHost={isHost}
              isLoading={isLoading}
              onPlay={onPlay}
              onPause={onPause}
              onSeek={() => {
                // Only hosts can seek, so only call onSeeked for hosts
                if (isHost) {
                  onSeeked();
                }
              }}
              onShowChatOverlay={onShowChatOverlay}
              subtitleTracks={subtitleTracks}
              activeSubtitleTrack={activeSubtitleTrack}
              onAddSubtitleTracks={onAddSubtitleTracks}
              onRemoveSubtitleTrack={onRemoveSubtitleTrack}
              onActiveSubtitleTrackChange={onActiveSubtitleTrackChange}
              currentVideoTitle={currentVideoTitle}
              className="z-20"
              onControlsVisibilityChange={setControlsVisible}
              onFullscreenChange={setIsFullscreen}
            />
          )}

          {/* Block video controls for non-hosts on YouTube */}
          {!isHost && videoType === 'youtube' && (
            <div
              className="absolute inset-0 z-10"
              onClick={onControlAttempt}
              title="Only hosts can control video playback"
            />
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Video className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{getVideoTypeName()}</span>
          </div>
          <div className="flex items-center space-x-2">
            {isHost && onVideoChange && (
              <Dialog open={isChangeDialogOpen} onOpenChange={handleDialogOpenChange}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="fixed left-[50%] top-[50%] flex max-h-[85vh] w-[95vw] max-w-md translate-x-[-50%] translate-y-[-50%] flex-col gap-0 overflow-hidden p-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
                  <DialogHeader className="flex-shrink-0 px-6 pb-4 pt-6">
                    <DialogTitle className="flex items-center space-x-2 text-base sm:text-lg">
                      <Edit3 className="h-5 w-5 text-primary" />
                      <span>Change Video</span>
                    </DialogTitle>
                    <DialogDescription className="text-sm">
                      Enter a new YouTube, MP4, or M3U8 (HLS) video URL to change what everyone is watching.
                    </DialogDescription>
                  </DialogHeader>

                  <ScrollArea className="min-h-0 flex-1 px-6">
                    <div className="space-y-4 py-4">
                      {!showConfirmation ? (
                        <form onSubmit={handleSubmit} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="newVideoUrl">Video URL</Label>
                            <Input
                              id="newVideoUrl"
                              placeholder="Enter YouTube, MP4, or M3U8 URL"
                              value={newUrl}
                              onChange={e => setNewUrl(e.target.value)}
                            />
                          </div>

                          {error && (
                            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
                          )}
                        </form>
                      ) : (
                        <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950 sm:p-4">
                          <h4 className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-100 sm:text-base">
                            <AlertTriangle className="h-4 w-4" />
                            Confirm Video Change
                          </h4>
                          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300 sm:text-sm">
                            This will change the video for everyone in the room. The current video playback will stop
                            and the new video will be loaded.
                          </p>
                          <div className="mt-3 rounded bg-amber-100 p-2 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                            <div className="font-medium">New video:</div>
                            <div className="mt-1 text-wrap break-all">{pendingUrl}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  <div className="flex flex-shrink-0 justify-end gap-3 border-t bg-gray-50 p-6 pt-4 dark:bg-black">
                    {!showConfirmation ? (
                      <Button onClick={handleChangeVideoClick} size="sm" disabled={isLoading}>
                        {isLoading ? 'Setting Video...' : 'Change Video'}
                      </Button>
                    ) : (
                      <>
                        <Button onClick={handleCancelChange} variant="outline" size="sm" disabled={isLoading}>
                          Cancel
                        </Button>
                        <Button onClick={handleConfirmChange} size="sm" disabled={isLoading}>
                          {isLoading ? 'Changing...' : 'Confirm Change'}
                        </Button>
                      </>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <Button variant="ghost" size="sm" onClick={() => window.open(videoUrl, '_blank')}>
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
