'use client';

import { RefObject, memo, useState, useEffect } from 'react';
import { VideoPlayerContainer } from './VideoPlayerContainer';
import { VideoSetup } from './VideoSetup';
import { YouTubePlayerRef } from '@/src/core/video/youtube-player';
import { VideoPlayerRef } from '@/src/features/video-sync/components/VideoPlayer';
import { HLSPlayerRef } from '@/src/core/video/hls-player';
import { CastPlayerRef } from '@/src/features/media/cast';
import type { SubtitleTrack } from '@/types/schemas';
import { Loader2 } from 'lucide-react';
import { useSocket } from '@/src/core/socket';
import { PickerOverlay } from '@/src/features/picker/components/PickerOverlay';
import type { PickerCandidate, PickerRequiredResponse } from '@/types';

function CaptureSpinner() {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center">
      <div className="rounded-full bg-primary/20 p-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
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
  const { socket } = useSocket();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'proactive' | 'reactive'>('proactive');
  const [pickerCandidates, setPickerCandidates] = useState<PickerCandidate[]>([]);
  const [pickerWinnerUrl, setPickerWinnerUrl] = useState('');
  const [pickerReason, setPickerReason] = useState<'lowConfidence' | 'ambiguous' | 'both' | undefined>(undefined);

  useEffect(() => {
    if (!socket || !isHost) return;
    const handlePickerRequired = (data: PickerRequiredResponse) => {
      setPickerCandidates(data.candidates);
      setPickerWinnerUrl(data.winnerPlaybackUrl);
      setPickerReason(data.reason ?? undefined);
      setPickerMode('proactive');
      setPickerOpen(true);
    };
    socket.on('picker-required', handlePickerRequired);
    return () => {
      socket.off('picker-required', handlePickerRequired);
    };
  }, [socket, isHost]);

  const handlePickerSelect = (selectedUrl: string) => {
    // Update isWinner so reactive mode reflects the new selection
    setPickerCandidates(prev => prev.map(c => ({ ...c, isWinner: c.mediaUrl === selectedUrl })));
    setPickerWinnerUrl(selectedUrl);
    setPickerOpen(false);

    if (pickerMode === 'reactive') {
      // Picker state in Redis is already gone — just change the video directly.
      // Candidate mediaUrls are pipe URLs so dispatch hits Tier D (pass-through).
      onVideoChange(selectedUrl);
    } else {
      if (!socket) return;
      socket.emit('picker-select', { roomId, selectedUrl });
    }
  };

  const handlePickerDismiss = () => {
    if (!pickerWinnerUrl) {
      setPickerOpen(false);
      return;
    }
    handlePickerSelect(pickerWinnerUrl);
  };

  const handleWrongVideo = () => {
    setPickerMode('reactive');
    setPickerOpen(true);
  };

  return (
    <>
      {videoUrl && videoType ? (
        <div className="relative">
          {captureStatus && <CaptureSpinner />}
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
            alternatives={pickerCandidates.length > 0 ? pickerCandidates : undefined}
            onWrongVideo={pickerCandidates.length > 0 ? handleWrongVideo : undefined}
          />
        </div>
      ) : captureStatus ? (
        <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
          <CaptureSpinner />
        </div>
      ) : (
        <VideoSetup onVideoSet={onVideoChange} isHost={isHost} hasVideo={hasVideo} videoUrl={originalVideoUrl} />
      )}
      {isHost && (
        <PickerOverlay
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          mode={pickerMode}
          candidates={pickerCandidates}
          winnerPlaybackUrl={pickerWinnerUrl}
          reason={pickerReason}
          onSelect={handlePickerSelect}
          onDismiss={handlePickerDismiss}
        />
      )}
    </>
  );
});
