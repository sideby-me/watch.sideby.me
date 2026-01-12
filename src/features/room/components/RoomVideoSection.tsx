'use client';

import { RefObject, memo } from 'react';
import { VideoPlayerContainer } from './VideoPlayerContainer';
import { VideoSetup } from '@/components/video/video-setup';
import { YouTubePlayerRef } from '@/components/video/youtube-player';
import { VideoPlayerRef } from '@/components/video/video-player';
import { HLSPlayerRef } from '@/components/video/hls-player';
import type { SubtitleTrack } from '@/types/schemas';

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
}: RoomVideoSectionProps) {
  if (videoUrl && videoType) {
    return (
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
      />
    );
  }

  return <VideoSetup onVideoSet={onVideoChange} isHost={isHost} hasVideo={hasVideo} videoUrl={originalVideoUrl} />;
});
