'use client';

import { useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/use-socket';
import { useRoom } from '@/hooks/use-room';
import { useVideoSync } from '@/hooks/use-video-sync';
import { useSubtitles } from '@/hooks/use-subtitles';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { YouTubePlayerRef } from '@/components/video/youtube-player';
import { VideoPlayerRef } from '@/components/video/video-player';
import { HLSPlayerRef } from '@/components/video/hls-player';
import { formatTimestamp } from '@/lib/chat-timestamps';
import { VideoSetup } from '@/components/video/video-setup';
import { Chat, ChatOverlay } from '@/components/chat';
import { UserList } from '@/components/room/user-list';
import { RoomHeader } from '@/components/room/room-header';
import { ErrorDisplay, LoadingDisplay, SyncError, GuestInfoBanner } from '@/components/room/room-status';
import { VideoPlayerContainer } from '@/components/room/video-player-container';
import { HostControlDialog } from '@/components/room/host-control-dialog';
import { useFullscreenChatOverlay } from '@/hooks/use-fullscreen-chat-overlay';
import { useVoiceChat } from '@/hooks/use-voice-chat';
import { useVideoChat } from '@/hooks/use-video-chat';
import { VideoChatGrid } from '@/components/room/video-chat-grid';
import { VideoChatOverlay } from '@/components/room/video-chat-overlay';
import { useFullscreenPortalContainer } from '@/hooks/use-fullscreen-portal-container';
import { Spinner } from '../../../components/ui/spinner';
import { toast } from 'sonner';

type ClientVideoMeta = {
  originalUrl: string;
  playbackUrl: string;
  deliveryType: 'youtube' | 'file-direct' | 'file-proxy' | 'hls';
  videoType: 'youtube' | 'mp4' | 'm3u8' | null;
  containerHint?: string;
  codecWarning?: string;
  requiresProxy: boolean;
  decisionReasons: string[];
  probe: { status: number; contentType?: string; acceptRanges?: boolean };
  timestamp: number;
};

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const { socket } = useSocket();

  // Player refs
  const youtubePlayerRef = useRef<YouTubePlayerRef>(null);
  const videoPlayerRef = useRef<VideoPlayerRef>(null);
  const hlsPlayerRef = useRef<HLSPlayerRef>(null);

  // Use room hook for state and basic room operations
  const {
    room,
    currentUser,
    messages,
    typingUsers,
    error,
    syncError,
    showGuestInfoBanner,
    showHostDialog,
    showCopied,
    setShowGuestInfoBanner,
    setShowHostDialog,
    handlePromoteUser,
    handleKickUser,
    handleSendMessage,
    handleTypingStart,
    handleTypingStop,
    markMessagesAsRead,
    copyRoomId,
    shareRoom,
    handleToggleReaction,
  } = useRoom({ roomId });

  // Helper function to extract video ID from URL for subtitle storage
  const getVideoIdForStorage = (videoUrl?: string): string | undefined => {
    if (!videoUrl) return undefined;

    try {
      const urlObj = new URL(videoUrl);

      // YouTube URLs
      if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
        if (urlObj.hostname.includes('youtu.be')) {
          return urlObj.pathname.slice(1);
        } else if (urlObj.hostname.includes('youtube.com')) {
          return urlObj.searchParams.get('v') || undefined;
        }
      }

      // For other video types, use the full URL as the ID (hashed for localStorage key)
      return btoa(videoUrl)
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 16);
    } catch {
      return undefined;
    }
  };

  // Use local subtitle hook for subtitle management (no socket sync)
  const {
    subtitleTracks,
    activeTrackId: activeSubtitleTrack,
    addSubtitleTracks,
    removeSubtitleTrack,
    setActiveSubtitleTrack,
  } = useSubtitles({
    roomId,
    videoId: getVideoIdForStorage(room?.videoUrl),
  });

  // Use video sync hook for video synchronization
  const {
    syncVideo,
    startSyncCheck,
    stopSyncCheck,
    handleVideoPlay,
    handleVideoPause,
    handleVideoSeek,
    handleYouTubeStateChange,
    handleSetVideo,
  } = useVideoSync({
    room,
    currentUser,
    roomId,
    youtubePlayerRef,
    videoPlayerRef,
    hlsPlayerRef,
  });

  // Voice chat hook (must be before any early returns)
  const voice = useVoiceChat({ roomId, currentUser });
  const videochat = useVideoChat({ roomId, currentUser });
  // Voice capacity logic should be based on current voice participants, not total room users
  const VOICE_MAX = 5;
  // If user is in voice, derive from activePeerIds + self; else use public broadcasted count
  const voiceParticipantCount = voice.isEnabled ? voice.activePeerIds.length + 1 : voice.publicParticipantCount;
  const overCap = voiceParticipantCount >= VOICE_MAX;
  // Video participant public count mirrors voice logic
  const videoParticipantCount = videochat.isEnabled
    ? videochat.remoteStreams.length + 1
    : videochat.publicParticipantCount;

  // Handle video control attempts by guests
  const handleVideoControlAttempt = () => {
    if (!currentUser?.isHost) {
      setShowHostDialog(true);
      setShowGuestInfoBanner(false);
    }
  };

  const getActivePlayer = () => {
    if (!room?.videoType) return null;
    if (room.videoType === 'youtube') return youtubePlayerRef.current;
    if (room.videoType === 'm3u8') return hlsPlayerRef.current;
    return videoPlayerRef.current;
  };

  const safeDuration = (value?: number | null) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

  const handleChatTimestampClick = (seconds: number) => {
    if (!room?.videoUrl || !room.videoType) {
      toast.error("Can't time travel without a timeline! We need a video first.");
      return;
    }

    if (!currentUser?.isHost) {
      handleVideoControlAttempt();
      return;
    }

    const player = getActivePlayer();
    if (!player) {
      toast.error('The player is still waking up. Give it a quick second.');
      return;
    }

    const duration =
      safeDuration((player as YouTubePlayerRef | VideoPlayerRef | HLSPlayerRef).getDuration?.()) ??
      safeDuration(room.videoState?.duration);
    const target = duration ? Math.min(seconds, duration) : seconds;

    player.seekTo(target);
    handleVideoSeek();

    if (duration && seconds > duration) {
      toast.info(`That timestamp went past the end of time itself! We stopped at ${formatTimestamp(target)}.`);
    }
  };

  // Use fullscreen chat overlay hook
  const {
    isFullscreen,
    showChatOverlay,
    isChatMinimized,
    toggleChatMinimize,
    closeChatOverlay,
    showChatOverlayManually,
  } = useFullscreenChatOverlay();
  const fullscreenPortalContainer = useFullscreenPortalContainer();

  // Use keyboard shortcuts hook
  useKeyboardShortcuts({
    hasVideo: !!room?.videoUrl,
    isHost: currentUser?.isHost || false,
    onControlAttempt: handleVideoControlAttempt,
  });

  // Handle video sync events from socket
  useEffect(() => {
    if (!socket) return;

    const handleVideoPlayed = ({ currentTime, timestamp }: { currentTime: number; timestamp: number }) => {
      syncVideo(currentTime, true, timestamp);
    };

    const handleVideoPaused = ({ currentTime, timestamp }: { currentTime: number; timestamp: number }) => {
      syncVideo(currentTime, false, timestamp);
    };

    const handleVideoSeeked = ({ currentTime, timestamp }: { currentTime: number; timestamp: number }) => {
      syncVideo(currentTime, null, timestamp);
    };

    const handleSyncUpdate = ({
      currentTime,
      isPlaying,
      timestamp,
    }: {
      currentTime: number;
      isPlaying: boolean;
      timestamp: number;
    }) => {
      if (currentUser?.isHost) {
        // Hosts don't sync to sync-updates to avoid conflicts
        return;
      }
      console.log('📡 Received sync update from host');
      syncVideo(currentTime, isPlaying, timestamp);
    };

    socket.on('video-played', handleVideoPlayed);
    socket.on('video-paused', handleVideoPaused);
    socket.on('video-seeked', handleVideoSeeked);
    socket.on('sync-update', handleSyncUpdate);

    return () => {
      socket.off('video-played', handleVideoPlayed);
      socket.off('video-paused', handleVideoPaused);
      socket.off('video-seeked', handleVideoSeeked);
      socket.off('sync-update', handleSyncUpdate);
    };
  }, [socket, syncVideo, currentUser?.isHost]);

  // Start/stop sync check based on host status
  useEffect(() => {
    if (currentUser?.isHost && room?.videoUrl) {
      console.log('🎯 Starting sync check - user is host');
      startSyncCheck();
    } else {
      console.log('🛑 Stopping sync check - user is not host or no video');
      stopSyncCheck();
    }

    return () => {
      stopSyncCheck();
    };
  }, [currentUser?.isHost, room?.videoUrl, startSyncCheck, stopSyncCheck]);

  // Handle errors
  if (error) {
    return <ErrorDisplay error={error} onRetry={() => router.push('/join')} />;
  }

  // Handle loading state
  if (!room || !currentUser) {
    return <LoadingDisplay roomId={roomId} />;
  }

  const meta = (room as unknown as { videoMeta?: ClientVideoMeta }).videoMeta;
  const effectiveVideoUrl = meta?.playbackUrl || room.videoUrl;
  const effectiveVideoType = meta?.videoType || room.videoType;

  const extractYouTubeId = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    try {
      // Handle already an ID (rare) by length heuristic
      if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
      const u = new URL(url);
      if (u.hostname.includes('youtu.be')) {
        const id = u.pathname.slice(1);
        return id || undefined;
      }
      // /watch?v=ID
      const v = u.searchParams.get('v');
      if (v) return v;
      // /embed/ID
      const embedMatch = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return embedMatch[1];
      return undefined;
    } catch {
      return undefined;
    }
  };
  const youTubeId = effectiveVideoType === 'youtube' ? extractYouTubeId(effectiveVideoUrl) : undefined;

  return (
    <div className="space-y-6">
      {/* Room Header */}
      <RoomHeader
        roomId={roomId}
        hostName={room.hostName}
        hostCount={room.users.filter(u => u.isHost).length}
        isHost={currentUser.isHost}
        showCopied={showCopied}
        onCopyRoomId={copyRoomId}
        onShareRoom={shareRoom}
      />

      {/* Sync Error */}
      {syncError && <SyncError error={syncError} />}

      {/* Guest Info Banner */}
      {showGuestInfoBanner && !currentUser.isHost && room.videoUrl && (
        <GuestInfoBanner onLearnMore={() => setShowHostDialog(true)} onDismiss={() => setShowGuestInfoBanner(false)} />
      )}

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Main Content */}
        <div className="col-span-full lg:col-span-3">
          {/* Video Player */}
          {effectiveVideoUrl && effectiveVideoType ? (
            <VideoPlayerContainer
              roomId={roomId}
              videoUrl={effectiveVideoUrl}
              videoType={effectiveVideoType}
              videoId={youTubeId}
              isHost={currentUser.isHost}
              onPlay={handleVideoPlay}
              onPause={handleVideoPause}
              onSeeked={handleVideoSeek}
              onYouTubeStateChange={handleYouTubeStateChange}
              onControlAttempt={handleVideoControlAttempt}
              onVideoChange={handleSetVideo}
              onShowChatOverlay={showChatOverlayManually}
              subtitleTracks={subtitleTracks}
              activeSubtitleTrack={activeSubtitleTrack}
              onAddSubtitleTracks={addSubtitleTracks}
              onRemoveSubtitleTrack={removeSubtitleTrack}
              onActiveSubtitleTrackChange={setActiveSubtitleTrack}
              currentVideoTitle={undefined}
              youtubePlayerRef={youtubePlayerRef}
              videoPlayerRef={videoPlayerRef}
              hlsPlayerRef={hlsPlayerRef}
            />
          ) : (
            <VideoSetup
              onVideoSet={handleSetVideo}
              isHost={currentUser.isHost}
              hasVideo={!!room.videoUrl}
              videoUrl={room.videoUrl}
            />
          )}
        </div>

        {/* Chat */}
        <div className="col-span-full lg:col-span-1">
          <Chat
            mode="sidebar"
            messages={messages}
            currentUserId={currentUser.id}
            users={room.users.map(u => ({ id: u.id, name: u.name }))}
            onSendMessage={handleSendMessage}
            onTypingStart={handleTypingStart}
            onTypingStop={handleTypingStop}
            onToggleReaction={handleToggleReaction}
            typingUsers={typingUsers}
            voice={{
              isEnabled: voice.isEnabled,
              isMuted: voice.isMuted,
              isConnecting: voice.isConnecting,
              participantCount: voiceParticipantCount,
              overCap,
              onEnable: voice.enable,
              onDisable: voice.disable,
              onToggleMute: voice.toggleMute,
            }}
            onTimestampClick={handleChatTimestampClick}
            video={{
              isEnabled: videochat.isEnabled,
              isCameraOff: videochat.isCameraOff,
              isConnecting: videochat.isConnecting,
              enable: videochat.enable,
              disable: videochat.disable,
              toggleCamera: videochat.toggleCamera,
              participantCount: videoParticipantCount,
            }}
            className="border-0 p-0"
          />
        </div>

        {/* Video Chat Grid */}
        {videochat.isEnabled && (
          <div className="col-span-full mx-6 mt-4">
            <VideoChatGrid
              localStream={videochat.localStream}
              remoteStreams={videochat.remoteStreams}
              currentUserId={currentUser.id}
              isCameraOff={videochat.isCameraOff}
              users={room.users}
              className="w-full"
            />
            <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
              {videochat.isConnecting && <Spinner variant="ellipsis" />}
              {videochat.error && <span className="text-destructive">{videochat.error}</span>}
            </div>
          </div>
        )}

        <UserList
          users={room.users}
          currentUserId={currentUser.id}
          currentUserIsHost={currentUser.isHost}
          onPromoteUser={handlePromoteUser}
          onKickUser={handleKickUser}
          speakingUserIds={voice.speakingUserIds}
          className="col-span-full mt-4 rounded-md"
        />
      </div>

      {/* Host Control Dialog */}
      <HostControlDialog open={showHostDialog} onOpenChange={setShowHostDialog} />

      <ChatOverlay
        messages={messages}
        currentUserId={currentUser.id}
        users={room.users.map(u => ({ id: u.id, name: u.name }))}
        onSendMessage={handleSendMessage}
        onTypingStart={handleTypingStart}
        onTypingStop={handleTypingStop}
        onToggleReaction={handleToggleReaction}
        typingUsers={typingUsers}
        isVisible={showChatOverlay}
        isMinimized={isChatMinimized}
        onToggleMinimize={toggleChatMinimize}
        onClose={closeChatOverlay}
        onMarkMessagesAsRead={markMessagesAsRead}
        voice={{
          isEnabled: voice.isEnabled,
          isMuted: voice.isMuted,
          isConnecting: voice.isConnecting,
          participantCount: voiceParticipantCount,
          overCap,
          onEnable: voice.enable,
          onDisable: voice.disable,
          onToggleMute: voice.toggleMute,
        }}
        video={{
          isEnabled: videochat.isEnabled,
          isCameraOff: videochat.isCameraOff,
          isConnecting: videochat.isConnecting,
          enable: videochat.enable,
          disable: videochat.disable,
          toggleCamera: videochat.toggleCamera,
          participantCount: videoParticipantCount,
        }}
        onTimestampClick={handleChatTimestampClick}
      />
      {videochat.isEnabled && isFullscreen && (
        <VideoChatOverlay
          isVisible={true}
          localStream={videochat.localStream}
          remoteStreams={videochat.remoteStreams}
          currentUserId={currentUser.id}
          isCameraOff={videochat.isCameraOff}
          users={room.users}
          portalContainer={fullscreenPortalContainer}
        />
      )}
    </div>
  );
}
