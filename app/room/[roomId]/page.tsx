'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/use-socket';
import { useRoom } from '@/hooks/use-room';
import { useVideoSync } from '@/hooks/use-video-sync';
import { useSubtitles } from '@/hooks/use-subtitles';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useVoiceChat } from '@/hooks/use-voice-chat';
import { YouTubePlayerRef } from '@/components/video/youtube-player';
import { VideoPlayerRef } from '@/components/video/video-player';
import { HLSPlayerRef } from '@/components/video/hls-player';
import { VideoSetup } from '@/components/video/video-setup';
import { Chat } from '@/components/chat/chat';
import { ChatOverlay } from '@/components/chat/chat-overlay';
import { UserList } from '@/components/room/user-list';
import { RoomHeader } from '@/components/room/room-header';
import { ErrorDisplay, LoadingDisplay, SyncError, GuestInfoBanner } from '@/components/room/room-status';
import { VideoPlayerContainer } from '@/components/room/video-player-container';
import { HostControlDialog } from '@/components/room/host-control-dialog';
import { VoiceChatControls } from '@/components/room/voice-chat-controls';
import { VoiceNotifications } from '@/components/room/voice-notifications';
import { useFullscreenChatOverlay } from '@/hooks/use-fullscreen-chat-overlay';
import { parseVideoUrl } from '@/lib/video-utils';
import { isEnabled } from '@/lib/feature-flags';

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
    handleSendMessage,
    handleTypingStart,
    handleTypingStop,
    markMessagesAsRead,
    copyRoomId,
    shareRoom,
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

  // Use voice chat hook for voice communication
  const initialVoiceUsers = useMemo(
    () =>
      room?.users.map(u => ({
        userId: u.id,
        userName: u.name,
        voiceEnabled: u.voiceEnabled,
        isMuted: u.isMuted,
        isDeafened: u.isDeafened,
      })) || [],
    [room?.users]
  );

  const {
    isVoiceEnabled,
    isMuted,
    isDeafened,
    isConnecting,
    voiceUsers,
    needsAudioUnlock,
    toggleVoiceChat,
    toggleMute,
    toggleDeafen,
    unlockAudio,
  } = useVoiceChat({
    roomId,
    userId: currentUser?.id || '',
    isHost: currentUser?.isHost || false,
    initialVoiceUsers,
  });

  // Handle video control attempts by guests
  const handleVideoControlAttempt = () => {
    if (!currentUser?.isHost) {
      setShowHostDialog(true);
      setShowGuestInfoBanner(false);
    }
  };

  // Use fullscreen chat overlay hook
  const { showChatOverlay, isChatMinimized, toggleChatMinimize, closeChatOverlay, showChatOverlayManually } =
    useFullscreenChatOverlay();

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

  const parsedVideo = room.videoUrl ? parseVideoUrl(room.videoUrl) : null;

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
        <div className="space-y-6 lg:col-span-3">
          {/* Video Player */}
          {room.videoUrl && parsedVideo && room.videoType ? (
            <VideoPlayerContainer
              videoUrl={room.videoUrl}
              videoType={room.videoType}
              videoId={parsedVideo.embedUrl.split('/embed/')[1]?.split('?')[0]}
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

        {/* Sidebar */}
        <div className="space-y-6">
          <UserList
            users={room.users}
            currentUserId={currentUser.id}
            currentUserIsHost={currentUser.isHost}
            onPromoteUser={handlePromoteUser}
          />

          {isEnabled('VOICE_CHAT') && (
            <VoiceChatControls
              isVoiceEnabled={isVoiceEnabled}
              isMuted={isMuted}
              isDeafened={isDeafened}
              isConnecting={isConnecting}
              voiceUsers={voiceUsers}
              needsAudioUnlock={needsAudioUnlock}
              onToggleVoice={toggleVoiceChat}
              onToggleMute={toggleMute}
              onToggleDeafen={toggleDeafen}
              onUnlockAudio={unlockAudio}
              maxVoiceUsers={room.maxVoiceUsers || 5}
            />
          )}

          <Chat
            messages={messages}
            currentUserId={currentUser.id}
            onSendMessage={handleSendMessage}
            onTypingStart={handleTypingStart}
            onTypingStop={handleTypingStop}
            typingUsers={typingUsers}
          />
        </div>
      </div>

      {/* Host Control Dialog */}
      <HostControlDialog open={showHostDialog} onOpenChange={setShowHostDialog} />

      {/* Voice Chat Notifications */}
      {isEnabled('VOICE_CHAT') && <VoiceNotifications voiceUsers={voiceUsers} currentUserId={currentUser.id} />}

      {/* Chat Overlay for Fullscreen */}
      {(() => {
        console.log('About to render ChatOverlay with:', {
          showChatOverlay: !!showChatOverlay,
          isChatMinimized: !!isChatMinimized,
          messagesLength: messages.length,
        });
        return null;
      })()}
      <ChatOverlay
        messages={messages}
        currentUserId={currentUser.id}
        onSendMessage={handleSendMessage}
        onTypingStart={handleTypingStart}
        onTypingStop={handleTypingStop}
        typingUsers={typingUsers}
        isVisible={showChatOverlay}
        isMinimized={isChatMinimized}
        onToggleMinimize={toggleChatMinimize}
        onClose={closeChatOverlay}
        onMarkMessagesAsRead={markMessagesAsRead}
      />
    </div>
  );
}
