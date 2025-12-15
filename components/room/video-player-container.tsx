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
import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseVideoUrl, getSupportedVideoFormats } from '@/lib/video-utils';
import { toast } from 'sonner';
import { useSocket } from '@/hooks/use-socket';

interface VideoPlayerContainerProps {
  roomId?: string;
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
  roomId,
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
  const { socket } = useSocket();
  const [isChangeDialogOpen, setIsChangeDialogOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingUrl, setPendingUrl] = useState('');
  const [videoRefReady, setVideoRefReady] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true); // Start with controls visible
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoSourceValid, setVideoSourceValid] = useState<boolean | null>(true);
  const [usingProxy, setUsingProxy] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const lastErrorReportRef = useRef<number>(0);
  const ERROR_REPORT_DEBOUNCE_MS = 4000;

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

  // Validate video source for non-YouTube videos
  useEffect(() => {
    if (videoType === 'youtube') {
      setVideoSourceValid(true);
      setPlaybackError(null);
      return;
    }
    const supportedFormats = getSupportedVideoFormats();
    if (videoType === 'm3u8' && !supportedFormats.hls) {
      console.warn('⚠️ HLS not natively supported; using HLS.js');
    }
    setVideoSourceValid(true);
    setPlaybackError(null);
    setUsingProxy(videoUrl?.includes('/api/video-proxy') ?? false);
  }, [videoUrl, videoType]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newUrl.trim()) {
      setError('Hello? you forgot the link??!?');
      return;
    }

    setIsLoading(true);
    setError('');

    const parsed = parseVideoUrl(newUrl.trim());
    if (!parsed) {
      setError(
        `Hmm, that link doesn't look right. We can handle a public http/https video link (YouTube, HLS, MP4, or similar).`
      );
      setIsLoading(false);
      return;
    }

    // For non-YouTube videos, validate the source
    if (parsed.type !== 'youtube') {
      console.log('🔍 Validating new video source...');
      try {
        // Server-side validation now
      } catch (error) {
        console.error('Validation error:', error);
        setError(
          "Umm, we couldn't connect to that video. The link might be broken, private, or blocked. Maybe double-check it?"
        );
        setIsLoading(false);
        return;
      }
    }

    setPendingUrl(newUrl.trim());
    setShowConfirmation(true);
    setIsLoading(false);
  };

  const handleChangeVideoClick = async () => {
    if (!newUrl.trim()) {
      setError('Hello? you forgot the link??!?');
      return;
    }

    setIsLoading(true);
    setError('');

    const parsed = parseVideoUrl(newUrl.trim());
    if (!parsed) {
      setError(
        `Hmm, that link doesn't look right. We can handle a public http/https video link (YouTube, HLS, MP4, or similar).`
      );
      setIsLoading(false);
      return;
    }

    // For non-YouTube videos, validate the source
    if (parsed.type !== 'youtube') {
      console.log('🔍 Validating new video source...');
      try {
        // Server-side validation now
      } catch (error) {
        console.error('Validation error:', error);
        setError(
          "Umm, we couldn't connect to that video. The link might be broken, private, or blocked. Maybe double-check it?"
        );
        setIsLoading(false);
        return;
      }
    }

    setPendingUrl(newUrl.trim());
    setShowConfirmation(true);
    setIsLoading(false);
  };

  const executeVideoChange = () => {
    if (!onVideoChange) return;

    setIsLoading(true);
    setError('');

    onVideoChange(pendingUrl);

    setTimeout(() => {
      toast.success("And we're live!", {
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

  const renderPlayer = () => {
    // Show error state if video source validation failed
    // If server provided URL fails, onError path will trigger proxy or report.

    // Render the video
    switch (videoType) {
      case 'youtube':
        // Fallback extraction if videoId not explicitly provided
        let effectiveId = videoId || '';
        if (!effectiveId && videoUrl) {
          try {
            if (/^[a-zA-Z0-9_-]{11}$/.test(videoUrl)) {
              effectiveId = videoUrl;
            } else {
              const u = new URL(videoUrl);
              if (u.hostname.includes('youtu.be')) {
                effectiveId = u.pathname.slice(1);
              } else {
                const v = u.searchParams.get('v');
                if (v) effectiveId = v;
                else {
                  const m = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
                  if (m) effectiveId = m[1];
                }
              }
            }
          } catch {
            // ignore parse errors
          }
        }
        return (
          <YouTubePlayer
            ref={youtubePlayerRef}
            videoId={effectiveId}
            onStateChange={onYouTubeStateChange}
            className="h-full w-full"
          />
        );
      case 'm3u8':
        return (
          <HLSPlayer
            ref={hlsPlayerRef}
            src={videoUrl}
            useProxy={videoUrl.includes('/api/video-proxy')}
            onPlay={onPlay}
            onPause={onPause}
            onSeeked={onSeeked}
            onError={err => {
              setPlaybackError(
                `We couldn't load this HLS stream. It might be expired, behind a firewall (403), or just being a bit shy with our proxy. Time for a new link?`
              );
              setIsLoading(false);
              setVideoSourceValid(false);
              setUsingProxy(videoUrl.includes('/api/video-proxy'));
              console.log('🎯 HLS reported fatal error:', err);
            }}
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
            onError={err => {
              console.log('🎯 VideoPlayer reported error:', err);
              const now = Date.now();
              if (socket && now - lastErrorReportRef.current > ERROR_REPORT_DEBOUNCE_MS) {
                lastErrorReportRef.current = now;
                try {
                  const effectiveRoomId =
                    roomId || (typeof window !== 'undefined' ? window.location.pathname.split('/').pop() || '' : '');
                  if (effectiveRoomId) {
                    socket.emit('video-error-report', {
                      roomId: effectiveRoomId,
                      code: err.code,
                      message: err.message,
                      currentSrc: videoUrl,
                      currentTime:
                        (videoPlayerRef.current?.getCurrentTime && videoPlayerRef.current.getCurrentTime()) || 0,
                    });
                  }
                } catch (e) {
                  console.warn('Failed to emit video-error-report', e);
                }
              }
              const alreadyProxy = videoUrl.includes('/api/video-proxy');
              if (err.code === 4 && !usingProxy && !alreadyProxy && onVideoChange) {
                console.log('🔁 Switching to proxy due to player error code 4');
                const origin = typeof window !== 'undefined' ? window.location.origin : '';
                const proxyUrl = `${origin}/api/video-proxy?url=${encodeURIComponent(videoUrl)}`;
                onVideoChange(proxyUrl);
                setUsingProxy(true);
                setPlaybackError(null);
              } else {
                setPlaybackError(
                  `Oof, the player didn't like that one. The link might be broken, blocked, or just unsupported. Do you have a backup link?`
                );
                setIsLoading(false);
                setVideoSourceValid(false);
              }
            }}
          />
        );
    }
  };

  return (
    <Card className="border-0 py-0">
      <CardContent className="-px-6">
        <div
          className={`relative aspect-video overflow-hidden rounded-lg bg-black ${
            controlsVisible ? 'video-container-with-controls' : ''
          } ${isFullscreen ? 'video-container-fullscreen' : ''}`}
          data-video-container
        >
          {renderPlayer()}

          {playbackError ? (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 px-4 text-center text-sm text-primary-foreground">
              <div className="text-xl font-semibold tracking-tighter">Playback hit a snag</div>
              <div className="mt-2 max-w-lg text-neutral">{playbackError}</div>
              {isHost ? (
                <div className="mt-4 flex flex-wrap items-center justify-center">
                  <Button size="sm" variant="secondary" onClick={() => setIsChangeDialogOpen(true)}>
                    Pick another link
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Custom subtitle overlay for non-YouTube videos */}
          {videoType !== 'youtube' && videoSourceValid !== false && (
            <SubtitleOverlay
              videoRef={getVideoElementRef()}
              subtitleTracks={subtitleTracks}
              activeSubtitleTrack={activeSubtitleTrack}
              controlsVisible={controlsVisible}
              isFullscreen={isFullscreen}
            />
          )}

          {/* Unified video controls for non-YouTube videos */}
          {videoType !== 'youtube' && videoRefReady && videoSourceValid !== false && (
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
              title="Just a heads-up: only the host has the remote."
            />
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Video className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-sm tracking-tighter text-muted-foreground">{getVideoTypeName()}</span>
          </div>
          <div className="flex items-center space-x-2">
            {/* Dialog for changing video */}
            {isHost && onVideoChange && (
              <Dialog open={isChangeDialogOpen} onOpenChange={handleDialogOpenChange}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader className="flex-shrink-0 px-6 pt-6">
                    <DialogTitle className="flex items-center space-x-2 text-base sm:text-lg">
                      <Edit3 className="h-5 w-5 text-primary" />
                      <span className="text-xl font-semibold tracking-tighter">Change Video</span>
                    </DialogTitle>
                    <DialogDescription className="text-sm tracking-tight text-neutral">
                      Enter a new YouTube, MP4, or M3U8 (HLS) video URL to change what everyone is watching.
                    </DialogDescription>
                  </DialogHeader>

                  <ScrollArea className="min-h-0 flex-1 px-6 py-2">
                    <div className="space-y-4 py-4">
                      {!showConfirmation ? (
                        <form onSubmit={handleSubmit} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="newVideoUrl" className="tracking-tight">
                              What else can we watch?
                            </Label>
                            <Input
                              id="newVideoUrl"
                              placeholder="Paste the next link here..."
                              value={newUrl}
                              onChange={e => setNewUrl(e.target.value)}
                            />
                            {error && <div className="text-sm text-destructive">{error}</div>}
                          </div>
                        </form>
                      ) : (
                        <div className="rounded-lg bg-destructive-100 p-3 sm:p-4">
                          <h4 className="flex items-center gap-2 text-destructive-800 sm:text-base">
                            <AlertTriangle className="h-5 w-5" />
                            <span className="text-xl font-semibold tracking-tighter">Heads-up, Captain!</span>
                          </h4>
                          <p className="mt-2 text-xs tracking-tight text-destructive-800 sm:text-sm">
                            {`Just confirming: this will swap the video for *everyone* in the room right now.`}
                          </p>
                          <div className="mt-4 rounded-sm bg-destructive-400 p-2 text-xs text-destructive-900">
                            <div className="font-medium">Next up:</div>
                            <div className="mt-1 text-wrap break-all">{pendingUrl}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  {/* Confirm Change */}
                  <div className="flex flex-shrink-0 justify-end gap-3 border-t bg-black px-6 py-4">
                    {!showConfirmation ? (
                      <Button onClick={handleChangeVideoClick} disabled={isLoading}>
                        {isLoading ? 'Checking link...' : 'Change Video'}
                      </Button>
                    ) : (
                      <>
                        <Button onClick={handleCancelChange} variant="outline" disabled={isLoading}>
                          Never mind
                        </Button>
                        <Button onClick={handleConfirmChange} disabled={isLoading}>
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
