import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { YouTubePlayer, YouTubePlayerRef } from '@/src/core/video/youtube-player';
import { VideoPlayer, VideoPlayerRef } from '@/src/features/video-sync/components/VideoPlayer';
import { HLSPlayer, HLSPlayerRef } from '@/src/core/video/hls-player';
import { VideoControls } from '@/src/features/video-sync/components/VideoControls';
import { SubtitleOverlay } from '@/src/features/subtitles/components';
import { Video, ExternalLink, Edit3, AlertTriangle, Cast } from 'lucide-react';
import type { SubtitleTrack } from '@/types/schemas';
import { CastPlayerRef } from '@/src/features/media/cast';
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
import { parseVideoUrl, getSupportedVideoFormats } from '@/src/lib/video-utils';
import { isProxiedUrl, buildProxyUrl } from '@/src/lib/video-proxy-client';
import { toast } from 'sonner';
import { useSocket } from '@/src/core/socket';
import { logClient, logDebug } from '@/src/core/logger';

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
  // Cast integration
  isCasting?: boolean;
  isCastAvailable?: boolean;
  castDeviceName?: string;
  onCastClick?: () => void;
  castPlayerRef?: React.RefObject<CastPlayerRef | null>;
  applyPendingSync?: () => void;
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
  isCasting = false,
  isCastAvailable = false,
  castDeviceName,
  onCastClick,
  castPlayerRef,
  applyPendingSync,
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
  const codecRetryAttemptedRef = useRef(false);

  // Local proxy URL override for guests (doesn't affect room state)
  const [localProxyUrl, setLocalProxyUrl] = useState<string | null>(null);
  const guestProxyTriedRef = useRef(false);

  // Initial load tracking for retry logic on very early errors
  const isInitialLoadRef = useRef(true);
  const initialLoadStartTimeRef = useRef<number>(Date.now());
  const initialRetryAttemptedRef = useRef(false);
  const [videoKey, setVideoKey] = useState(0);
  const INITIAL_LOAD_GRACE_MS = 3000; // 3 second grace window

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
      logDebug('video', 'hls_fallback', 'HLS not natively supported; using HLS.js');
    }
    setVideoSourceValid(true);
    setPlaybackError(null);
    setUsingProxy(videoUrl ? isProxiedUrl(videoUrl) : false);
    // Reset guest local proxy state when room video URL changes
    setLocalProxyUrl(null);
    guestProxyTriedRef.current = false;
    codecRetryAttemptedRef.current = false;
    // Reset initial load tracking when video URL changes
    isInitialLoadRef.current = true;
    initialLoadStartTimeRef.current = Date.now();
    initialRetryAttemptedRef.current = false;
    setVideoKey(0);
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
      logDebug('video', 'validate_source', 'Validating new video source');
      try {
        // Server-side validation now
      } catch (error) {
        logClient({
          level: 'error',
          domain: 'video',
          event: 'validation_error',
          message: 'Video validation failed',
          meta: { error: String(error) },
        });
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
      logDebug('video', 'validate_source', 'Validating new video source', { url: newUrl });
      try {
        // Server-side validation now
      } catch (error) {
        logClient({
          level: 'error',
          domain: 'video',
          event: 'validation_error',
          message: 'Video validation failed',
          meta: { error: String(error) },
        });
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
            useProxy={isProxiedUrl(videoUrl)}
            onPlay={onPlay}
            onPause={onPause}
            onSeeked={onSeeked}
            onError={err => {
              const codecUnparsable = Boolean(err?.codecUnparsable);
              const responseCode = err?.responseCode;

              if (isHost) {
                const now = Date.now();
                if (socket && now - lastErrorReportRef.current > ERROR_REPORT_DEBOUNCE_MS) {
                  lastErrorReportRef.current = now;
                  try {
                    const effectiveRoomId =
                      roomId || (typeof window !== 'undefined' ? window.location.pathname.split('/').pop() || '' : '');
                    if (effectiveRoomId) {
                      socket.emit('video-error-report', {
                        roomId: effectiveRoomId,
                        code: responseCode,
                        message: err?.details || err?.type || 'hls_error',
                        currentSrc: videoUrl,
                        currentTime: hlsPlayerRef.current?.getCurrentTime?.() || 0,
                        isHost: true,
                        codecUnparsable,
                      });
                    }
                  } catch (e) {
                    logClient({
                      level: 'warn',
                      domain: 'video',
                      event: 'error_report_fail',
                      message: 'Failed to emit video-error-report (HLS)',
                      meta: { error: String(e) },
                    });
                  }
                }
              }

              setPlaybackError(
                codecUnparsable
                  ? `Your browser couldn't parse this HLS stream. It might be a niche codec—try another browser/device or a different link that sticks to common H.264/AAC.`
                  : `We couldn't load this HLS stream. It might be expired, behind a firewall (403), or just being a bit shy with our proxy. Time for a new link?`
              );
              setIsLoading(false);
              setVideoSourceValid(false);
              setUsingProxy(isProxiedUrl(videoUrl));
              logClient({
                level: 'error',
                domain: 'video',
                event: 'hls_error',
                message: 'HLS reported fatal error',
                meta: { err, codecUnparsable, usingProxy: isProxiedUrl(videoUrl) },
              });
            }}
            isHost={isHost}
            subtitleTracks={subtitleTracks}
            activeSubtitleTrack={activeSubtitleTrack}
            className="h-full w-full"
            onLoadedMetadata={applyPendingSync}
          />
        );
      default:
        return (
          <VideoPlayer
            key={`video-${videoKey}`}
            ref={videoPlayerRef}
            src={localProxyUrl || videoUrl}
            onPlay={onPlay}
            onPause={onPause}
            onSeeked={onSeeked}
            isHost={isHost}
            subtitleTracks={subtitleTracks}
            activeSubtitleTrack={activeSubtitleTrack}
            className="h-full w-full"
            onReady={applyPendingSync}
            onError={err => {
              logClient({
                level: 'error',
                domain: 'video',
                event: 'player_error',
                message: 'VideoPlayer reported error',
                meta: {
                  code: err.code,
                  message: err.message,
                  codecUnparsable: err.codecUnparsable,
                  isHost,
                  isInitialLoad: isInitialLoadRef.current,
                  usingProxy,
                  localProxy: Boolean(localProxyUrl),
                },
              });

              // Check if we're within the initial load grace period for early retry
              const isWithinGracePeriod =
                isInitialLoadRef.current && Date.now() - initialLoadStartTimeRef.current < INITIAL_LOAD_GRACE_MS;

              // For very early errors on initial load, attempt one retry before surfacing
              if (isWithinGracePeriod && !initialRetryAttemptedRef.current && err.code === 4) {
                logClient({
                  level: 'info',
                  domain: 'video',
                  event: 'initial_load_retry',
                  message: 'Retrying initial video load after early error (upstream might still be warming up)',
                  meta: { code: err.code, elapsedMs: Date.now() - initialLoadStartTimeRef.current },
                });
                initialRetryAttemptedRef.current = true;
                // Force component remount by changing key
                setVideoKey(prev => prev + 1);
                return;
              }

              // Mark initial load as complete after first real error handling
              isInitialLoadRef.current = false;

              // Only hosts should emit error reports to server (for room-level fallback)
              const codecUnparsable = Boolean(err.codecUnparsable);

              if (isHost) {
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
                        isHost: true,
                        codecUnparsable,
                      });
                    }
                  } catch (e) {
                    logClient({
                      level: 'warn',
                      domain: 'video',
                      event: 'error_report_fail',
                      message: 'Failed to emit video-error-report',
                      meta: { error: String(e) },
                    });
                  }
                }
              }

              // Keep alreadyProxy based on room videoUrl (not localProxyUrl)
              const alreadyProxy = isProxiedUrl(videoUrl);

              if (
                codecUnparsable &&
                (localProxyUrl || usingProxy) &&
                !alreadyProxy &&
                !codecRetryAttemptedRef.current
              ) {
                // One-time retry without proxy if we previously fell back to proxy locally and the demux/codec still fails.
                codecRetryAttemptedRef.current = true;
                logClient({
                  level: 'info',
                  domain: 'video',
                  event: 'codec_retry_without_proxy',
                  message: 'Retrying without proxy after codec/demux error',
                  meta: { wasUsingProxy: usingProxy, hadLocalProxy: Boolean(localProxyUrl) },
                });
                setLocalProxyUrl(null);
                setUsingProxy(false);
                setVideoKey(prev => prev + 1);
                return;
              }

              if (codecUnparsable) {
                setPlaybackError(
                  usingProxy || localProxyUrl
                    ? `Your browser couldn't parse this video format, even after a proxy detour. Try a different browser or device, or drop in another link that sticks to mainstream codecs.`
                    : `Your browser couldn't parse this video format. It might be using a quirky codec—try a different browser/device or swap in another link that stays within the usual formats.`
                );
                setIsLoading(false);
                setVideoSourceValid(false);
                return;
              }

              if (err.code === 4 && !usingProxy && !alreadyProxy) {
                if (isHost && onVideoChange) {
                  // Host: trigger room-level fallback
                  logClient({
                    level: 'info',
                    domain: 'video',
                    event: 'proxy_switch',
                    message: 'Host switching to proxy due to player error code 4',
                  });
                  const proxyUrl = buildProxyUrl(
                    videoUrl,
                    typeof window !== 'undefined' ? window.location.href : undefined
                  );
                  onVideoChange(proxyUrl);
                  setUsingProxy(true);
                  setPlaybackError(null);
                } else if (!guestProxyTriedRef.current) {
                  // Guest: silently switch to proxy locally (no room state change)
                  logClient({
                    level: 'info',
                    domain: 'video',
                    event: 'guest_local_proxy',
                    message: 'Guest switching to local proxy after error code 4',
                  });
                  guestProxyTriedRef.current = true;
                  const proxyUrl = buildProxyUrl(
                    videoUrl,
                    typeof window !== 'undefined' ? window.location.href : undefined
                  );
                  setLocalProxyUrl(proxyUrl);
                  setUsingProxy(true);
                  setPlaybackError(null);
                } else {
                  // Guest already tried proxy, show error
                  setPlaybackError(
                    `We threw the proxy at it, but your browser is still refusing the handshake. A refresh might clear the cache, otherwise try a different browser.`
                  );
                  setIsLoading(false);
                  setVideoSourceValid(false);
                }
              } else {
                // Differentiate messaging for hosts vs guests
                if (isHost) {
                  setPlaybackError(
                    `Oof, the player didn't like that one. The link might be broken, blocked, or just unsupported. Do you have a backup link?`
                  );
                } else {
                  setPlaybackError(
                    `Your browser is having a disagreement with this video stream. The classic "turn it off and on again" (refresh) usually fixes it.`
                  );
                }
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
          {/* Casting overlay - show when casting is active */}
          {isCasting && (
            <div className="z-25 absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-black">
              <div className="flex flex-col items-center space-y-4 text-center">
                <div className="rounded-full bg-primary/20 p-6">
                  <Cast className="h-12 w-12 text-primary" />
                </div>
                <div className="text-xl font-semibold tracking-tight text-primary-foreground">
                  Casting to {castDeviceName || 'TV'}
                </div>
                <div className="text-sm text-muted-foreground">Use the controls below to control playback</div>
              </div>
            </div>
          )}

          {!isCasting && renderPlayer()}

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
          {videoType !== 'youtube' && (videoRefReady || isCasting) && videoSourceValid !== false && (
            <VideoControls
              videoRef={isCasting ? null : getVideoElementRef()}
              castPlayerRef={castPlayerRef}
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
              isCasting={isCasting}
              isCastAvailable={isCastAvailable}
              castDeviceName={castDeviceName}
              onCastClick={onCastClick}
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
