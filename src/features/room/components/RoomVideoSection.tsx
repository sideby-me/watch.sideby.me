'use client';

import { RefObject, memo } from 'react';
import { VideoPlayerContainer } from './VideoPlayerContainer';
import { VideoSetup } from './VideoSetup';
import { YouTubePlayerRef } from '@/src/core/video/youtube-player';
import { VideoPlayerRef } from '@/src/features/video-sync/components/VideoPlayer';
import { HLSPlayerRef } from '@/src/core/video/hls-player';
import { CastPlayerRef } from '@/src/features/media/cast';
import type { SubtitleTrack } from '@/types/schemas';
import { CheckCircle2, Loader2 } from 'lucide-react';

type CapturePhase = 'queued' | 'processing';

function getCapturePhase(captureStatus?: string | null): CapturePhase {
  return captureStatus === 'processing' ? 'processing' : 'queued';
}

function CaptureOverlay({ captureStatus }: { captureStatus?: string | null }) {
  if (!captureStatus) {
    return null;
  }

  const phase = getCapturePhase(captureStatus);
  const isProcessing = phase === 'processing';

  return (
    <div className="absolute inset-0 z-50 overflow-hidden rounded-lg bg-black/95 font-[family-name:var(--font-space-mono)] text-primary backdrop-blur-md selection:bg-primary/30">
      {/* Grid Background */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Frame Vignette */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(0,0,0,0.8)_100%)]" />

      {/* Viewfinder Bracket Corners */}
      <div className="absolute left-8 top-8 z-20 h-16 w-16 border-l-[3px] border-t-[3px] border-primary/50" />
      <div className="absolute right-8 top-8 z-20 h-16 w-16 border-r-[3px] border-t-[3px] border-primary/50" />
      <div className="absolute bottom-8 left-8 z-20 h-16 w-16 border-b-[3px] border-l-[3px] border-primary/50" />
      <div className="absolute bottom-8 right-8 z-20 h-16 w-16 border-b-[3px] border-r-[3px] border-primary/50" />

      {/* Top Left: REC Status */}
      <div className="absolute left-12 top-12 z-20 flex items-center gap-3">
        <div
          className={`h-3.5 w-3.5 rounded-sm ${isProcessing ? 'animate-pulse bg-red-500' : 'bg-primary/50'} shadow-[0_0_15px_currentColor]`}
        />
        <span className="text-sm font-bold tracking-[0.2em] text-primary/80">
          {isProcessing ? 'STREAM // ACTIVE' : 'STREAM // IDLE'}
        </span>
      </div>

      {/* Top Right: System Op */}
      <div className="absolute right-12 top-12 z-20 flex flex-col items-end gap-1 text-right">
        <span className="text-[10px] font-bold tracking-[0.2em] text-primary/50">NETWORK</span>
        <span className="text-sm font-bold tracking-[0.2em] text-primary/90">
          {isProcessing ? 'RESOLVING SOURCE' : 'AWAITING SIGNAL'}
        </span>
      </div>

      {/* Bottom Right: Timestamp / Meta */}
      <div className="absolute bottom-12 right-12 z-20 flex flex-col items-end gap-1 text-right">
        <span className="text-[10px] font-bold tracking-[0.2em] text-primary/50">ROUTING</span>
        <span className="max-w-[200px] truncate text-sm font-bold tracking-[0.15em] text-primary/80">
          MEDIA-SOURCE-PROXY
        </span>
      </div>

      {/* Bottom Left: Terminal Logs */}
      <div className="absolute bottom-12 left-12 z-20 flex flex-col gap-2.5">
        <div className="flex items-center gap-2 text-xs font-medium text-primary/40">
          <span className="opacity-50">&gt;</span>
          <span className={!isProcessing ? 'animate-pulse' : ''}>
            {isProcessing ? 'negotiating proxy connection...' : 'listening for network requests...'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-primary/60">
          <span className="opacity-50">&gt;</span>
          <span>{isProcessing ? 'connection established.' : 'waiting for valid manifest...'}</span>
        </div>
        <div className="flex items-center gap-2 text-sm font-bold text-primary">
          <span className="text-white opacity-50">&gt;</span>
          <span className="tracking-wider text-white">
            {isProcessing ? 'BUFFERING MEDIA SEGMENTS...' : 'PARSING DOM ELEMENTS...'}
          </span>
          <span className="ml-1 animate-[ping_1.5s_infinite] opacity-70">_</span>
        </div>
      </div>

      {/* Central Targeting UI */}
      <div className="absolute inset-0 z-20 flex items-center justify-center">
        <div className="relative flex h-[350px] w-[350px] items-center justify-center">
          {/* Outer rotating dashed ring */}
          <div className="absolute inset-0 animate-[spin_10s_linear_infinite] rounded-full border border-dashed border-primary/20" />

          {/* Inner counter-rotating ring */}
          <div className="absolute inset-6 animate-[spin_15s_linear_infinite_reverse] rounded-full border border-primary/10" />

          {/* Crosshairs */}
          <div className="absolute inset-0">
            <div className="absolute left-1/2 top-0 h-full w-[1px] -translate-x-1/2 bg-gradient-to-b from-transparent via-primary/30 to-transparent" />
            <div className="absolute left-0 top-1/2 h-[1px] w-full -translate-y-1/2 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          </div>

          {/* Central Data Block */}
          <div className="flex flex-col items-center justify-center border border-primary/20 bg-background/60 px-10 py-6 backdrop-blur-md">
            <span className="mb-3 font-[family-name:var(--font-space-grotesk)] text-4xl font-bold uppercase tracking-tight text-white">
              {isProcessing ? 'Locked On' : 'Scanning'}
            </span>
            <div className="relative h-1.5 w-full overflow-hidden bg-primary/20">
              <div
                className="absolute bottom-0 left-0 top-0 bg-primary transition-all duration-1000 ease-out"
                style={{ width: isProcessing ? '100%' : '35%' }}
              />
              {/* Shimmer effect when processing */}
              {isProcessing && <div className="absolute inset-0 w-full animate-pulse bg-white/20" />}
            </div>
            <span className="mt-4 font-mono text-[10px] font-bold tracking-[0.3em] text-primary/70">
              INITIALIZING PLAYER
            </span>
          </div>
        </div>
      </div>

      {/* Scanning Line overlay */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes scan {
          0% { transform: translateY(-50px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        .animate-scan-line {
          animation: scan 3s ease-in-out infinite;
        }
      `,
        }}
      />
      <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden mix-blend-screen">
        <div className="animate-scan-line h-[2px] w-full bg-primary/40 shadow-[0_0_20px_rgba(var(--primary),0.8)]" />
      </div>
    </div>
  );
}

interface RoomVideoSectionProps {
  roomId: string;
  videoUrl: string | undefined;
  videoType: 'youtube' | 'mp4' | 'm3u8' | undefined;
  youTubeId: string | undefined;
  isHost: boolean;
  hasVideo: boolean;
  originalVideoUrl: string | undefined;

  // Video event handlers
  onPlay: () => void;
  onPause: () => void;
  onSeeked: () => void;
  onYouTubeStateChange: (state: number) => void;
  onControlAttempt: () => void;
  onVideoChange: (url: string) => void;
  onShowChatOverlay: () => void;

  // Subtitle props
  subtitleTracks: SubtitleTrack[];
  activeSubtitleTrack: string | undefined;
  onAddSubtitleTracks: (tracks: SubtitleTrack[]) => void;
  onRemoveSubtitleTrack: (trackId: string) => void;
  onActiveSubtitleTrackChange: (trackId?: string) => void;

  // Player refs
  youtubePlayerRef: RefObject<YouTubePlayerRef | null>;
  videoPlayerRef: RefObject<VideoPlayerRef | null>;
  hlsPlayerRef: RefObject<HLSPlayerRef | null>;

  // Cast props
  isCasting: boolean;
  isCastAvailable: boolean;
  castDeviceName: string | undefined;
  onCastClick: () => void;
  castPlayerRef?: RefObject<CastPlayerRef | null>;
  applyPendingSync?: () => void;

  // Lens capture status
  captureStatus?: string | null;
}

export const RoomVideoSection = memo(function RoomVideoSection({
  roomId,
  videoUrl,
  videoType,
  youTubeId,
  isHost,
  hasVideo,
  originalVideoUrl,
  onPlay,
  onPause,
  onSeeked,
  onYouTubeStateChange,
  onControlAttempt,
  onVideoChange,
  onShowChatOverlay,
  subtitleTracks,
  activeSubtitleTrack,
  onAddSubtitleTracks,
  onRemoveSubtitleTrack,
  onActiveSubtitleTrackChange,
  youtubePlayerRef,
  videoPlayerRef,
  hlsPlayerRef,
  isCasting,
  isCastAvailable,
  castDeviceName,
  onCastClick,
  castPlayerRef,
  applyPendingSync,
  captureStatus,
}: RoomVideoSectionProps) {
  if (videoUrl && videoType) {
    return (
      <div className="relative">
        <CaptureOverlay captureStatus={captureStatus} />
        <VideoPlayerContainer
          roomId={roomId}
          videoUrl={videoUrl}
          videoType={videoType}
          videoId={youTubeId}
          isHost={isHost}
          onPlay={onPlay}
          onPause={onPause}
          onSeeked={onSeeked}
          onYouTubeStateChange={onYouTubeStateChange}
          onControlAttempt={onControlAttempt}
          onVideoChange={onVideoChange}
          onShowChatOverlay={onShowChatOverlay}
          subtitleTracks={subtitleTracks}
          activeSubtitleTrack={activeSubtitleTrack}
          onAddSubtitleTracks={onAddSubtitleTracks}
          onRemoveSubtitleTrack={onRemoveSubtitleTrack}
          onActiveSubtitleTrackChange={onActiveSubtitleTrackChange}
          currentVideoTitle={undefined}
          youtubePlayerRef={youtubePlayerRef}
          videoPlayerRef={videoPlayerRef}
          hlsPlayerRef={hlsPlayerRef}
          isCasting={isCasting}
          isCastAvailable={isCastAvailable && videoType !== 'youtube'}
          castDeviceName={castDeviceName}
          onCastClick={onCastClick}
          castPlayerRef={castPlayerRef}
          applyPendingSync={applyPendingSync}
        />
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <CaptureOverlay captureStatus={captureStatus} />
      <VideoSetup onVideoSet={onVideoChange} isHost={isHost} hasVideo={hasVideo} videoUrl={originalVideoUrl} />
    </div>
  );
});
