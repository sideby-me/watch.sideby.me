'use client';

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSocket } from '@/hooks/use-socket';
import { useRoomCore } from '@/src/features/room/hooks/use-room-core';
import { useRoomUiState } from '@/src/features/room/hooks/use-room-ui-state';
import { useChat } from '@/src/features/chat/hooks/use-chat';
import { useVideoSync } from '@/src/features/video-sync/hooks';
import { useSubtitles } from '@/src/features/subtitles/hooks';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useFullscreenChatOverlay } from '@/src/features/chat/hooks';
import { useFullscreenPortalContainer } from '@/src/features/room/hooks';
import { useVoiceChat } from '@/src/features/media/voice';
import { useVideoChat } from '@/src/features/media/videochat';
import { useGoogleCast } from '@/src/features/media/cast';
import { YouTubePlayerRef } from '@/components/video/youtube-player';
import { VideoPlayerRef } from '@/components/video/video-player';
import { HLSPlayerRef } from '@/components/video/hls-player';
import { formatTimestamp } from '@/lib/chat-timestamps';
import { roomSessionStorage } from '@/lib/session-storage';
import { VOICE_MAX_PARTICIPANTS } from '@/lib/constants';

import { RoomHeader } from './RoomHeader';
import { RoomVideoSection } from './RoomVideoSection';
import { RoomChatSection, RoomChatOverlaySection } from './RoomChatSection';
import { RoomDialogs } from './RoomDialogs';

import { ErrorDisplay, LoadingDisplay, SyncError, GuestInfoBanner } from './RoomStatus';
import { UserList } from './UserList';
import { VideoChatGrid } from './VideoChatGrid';
import { VideoChatOverlay } from './VideoChatOverlay';
import { LeaveRoomGuard } from '@/components/room/leave-room-guard';
import { JoinRoomDialog } from '@/components/room/join-room-dialog';
import { PasscodeDialog } from '@/components/room/passcode-dialog';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';

interface RoomShellProps {
  roomId: string;
}

export function RoomShell({ roomId }: RoomShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { socket, isConnected } = useSocket();

  // Player refs
  const youtubePlayerRef = useRef<YouTubePlayerRef>(null);
  const videoPlayerRef = useRef<VideoPlayerRef>(null);
  const hlsPlayerRef = useRef<HLSPlayerRef>(null);
  const initialVideoAppliedRef = useRef(false);
  const autoplayTriggeredRef = useRef(false);

  // Pending user name state for passcode flow
  const [pendingUserName, setPendingUserName] = useState('');
  const [lastJoinAttempt, setLastJoinAttempt] = useState<number>(0);

  // Google Cast hook
  const {
    isCasting,
    isAvailable: isCastAvailable,
    deviceName: castDeviceName,
    castPlayerRef,
    startCasting,
    stopCasting,
    requestSession: requestCastSession,
  } = useGoogleCast();

  // Core room state hook (no UI concerns)
  const core = useRoomCore({
    roomId,
    socket,
    isConnected,
  });

  // UI state hook
  const ui = useRoomUiState({
    roomId,
    socket,
    isConnected,
    pendingUserName,
    setPendingUserName,
    onJoinEmit: (userName: string, passcode?: string) => {
      if (passcode) {
        core.emitJoinRoom(userName, passcode);
      } else {
        core.emitJoinRoom(userName);
      }
    },
  });

  // Chat hook
  const chat = useChat({
    roomId,
    currentUserId: core.currentUser?.id,
    socket,
    isConnected,
  });

  // Wire up core callbacks for UI coordination
  useEffect(() => {
    core.onRoomJoined(data => {
      ui.resetPasscodeState();
      // Show info banner for guests when joining a room with video
      if (!data.user.isHost && data.room.videoUrl) {
        ui.showGuestBannerTemporarily();
      }
    });

    core.onVideoSet(_data => {
      if (core.currentUser && !core.currentUser.isHost) {
        ui.showGuestBannerTemporarily();
      }
    });

    core.onUserLeft(userId => {
      chat.clearTypingUser(userId);
    });

    core.onPasscodeRequired(() => {
      ui.setShowPasscodeDialog(true);
    });

    core.onPasscodeError(error => {
      ui.setPasscodeError(error);
      ui.setIsVerifyingPasscode(false);
    });

    core.onRoomClosed(() => {
      toast.error(`Party's Over!`, {
        description: `Looks like all the hosts have left, so this room is closing. We're sending you back home.`,
        duration: 4000,
      });
      setTimeout(() => router.push('/'), 1500);
    });

    core.onUserKicked(() => {
      toast.error('Kicked from Room', {
        description: 'You have been kicked from the room.',
        duration: 4000,
      });
      setTimeout(() => router.push('/'), 1500);
    });
  }, [core, ui, chat, router]);

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
    videoId: getVideoIdForStorage(core.room?.videoUrl),
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
    room: core.room,
    currentUser: core.currentUser,
    roomId,
    youtubePlayerRef,
    videoPlayerRef,
    hlsPlayerRef,
    castPlayerRef,
    isCasting,
  });

  const initialVideoUrlFromQuery = searchParams.get('videoUrl');
  const autoplayParam = searchParams.get('autoplay');

  // Voice chat hook
  const voice = useVoiceChat({ roomId, currentUser: core.currentUser });
  const videochat = useVideoChat({ roomId, currentUser: core.currentUser });

  // Voice capacity logic
  const voiceParticipantCount = voice.isEnabled ? voice.activePeerIds.length + 1 : voice.publicParticipantCount;
  const overCap = voiceParticipantCount >= VOICE_MAX_PARTICIPANTS;
  const videoParticipantCount = videochat.isEnabled
    ? videochat.remoteStreams.length + 1
    : videochat.publicParticipantCount;

  // Voice/video chat props - memoized for referential stability
  const voiceProps = useMemo(
    () => ({
      isEnabled: voice.isEnabled,
      isMuted: voice.isMuted,
      isConnecting: voice.isConnecting,
      participantCount: voiceParticipantCount,
      overCap,
      onEnable: voice.enable,
      onDisable: voice.disable,
      onToggleMute: voice.toggleMute,
    }),
    [
      voice.isEnabled,
      voice.isMuted,
      voice.isConnecting,
      voiceParticipantCount,
      overCap,
      voice.enable,
      voice.disable,
      voice.toggleMute,
    ]
  );

  const videoProps = useMemo(
    () => ({
      isEnabled: videochat.isEnabled,
      isCameraOff: videochat.isCameraOff,
      isConnecting: videochat.isConnecting,
      enable: videochat.enable,
      disable: videochat.disable,
      toggleCamera: videochat.toggleCamera,
      participantCount: videoParticipantCount,
    }),
    [
      videochat.isEnabled,
      videochat.isCameraOff,
      videochat.isConnecting,
      videochat.enable,
      videochat.disable,
      videochat.toggleCamera,
      videoParticipantCount,
    ]
  );

  // Handle video control attempts by guests
  const handleVideoControlAttempt = useCallback(() => {
    if (!core.currentUser?.isHost) {
      ui.setShowHostDialog(true);
      ui.setShowGuestInfoBanner(false);
    }
  }, [core.currentUser?.isHost, ui]);

  const getActivePlayer = useCallback(() => {
    if (!core.room?.videoType) return null;
    if (core.room.videoType === 'youtube') return youtubePlayerRef.current;
    if (core.room.videoType === 'm3u8') return hlsPlayerRef.current;
    return videoPlayerRef.current;
  }, [core.room?.videoType]);

  const safeDuration = (value?: number | null) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

  const handleChatTimestampClick = useCallback(
    (seconds: number) => {
      if (!core.room?.videoUrl || !core.room.videoType) {
        toast.error("Can't time travel without a timeline! We need a video first.");
        return;
      }

      if (!core.currentUser?.isHost) {
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
        safeDuration(core.room.videoState?.duration);
      const target = duration ? Math.min(seconds, duration) : seconds;

      player.seekTo(target);
      handleVideoSeek();

      if (duration && seconds > duration) {
        toast.info(`That timestamp went past the end of time itself! We stopped at ${formatTimestamp(target)}.`);
      }
    },
    [core.room, core.currentUser?.isHost, handleVideoControlAttempt, getActivePlayer, handleVideoSeek]
  );

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
    hasVideo: !!core.room?.videoUrl,
    isHost: core.currentUser?.isHost || false,
    onControlAttempt: handleVideoControlAttempt,
  });

  // Auto-join logic
  useEffect(() => {
    if (!socket || !isConnected || !roomId) {
      return;
    }

    if (core.room && core.currentUser) {
      return;
    }

    if (core.isJoining || core.hasAttemptedJoinRef.current) {
      return;
    }

    const now = Date.now();
    if (now - lastJoinAttempt < 2000) {
      return;
    }

    console.log('🚀 Starting room join process...');
    core.setIsJoining(true);
    setLastJoinAttempt(now);
    core.hasAttemptedJoinRef.current = true;

    // Check if this user is the room creator first
    const creatorData = roomSessionStorage.getRoomCreator(roomId);
    if (creatorData) {
      console.log('👑 Room creator detected, joining as host:', creatorData.hostName);
      roomSessionStorage.clearRoomCreator();
      core.emitJoinRoom(creatorData.hostName, undefined, creatorData.hostToken);
      return;
    }

    // Check if user came from join page
    const joinData = roomSessionStorage.getJoinData(roomId);
    if (joinData) {
      setPendingUserName(joinData.userName);
      roomSessionStorage.clearJoinData();
      console.log('👤 Joining with stored data:', joinData.userName);
      core.emitJoinRoom(joinData.userName);
      return;
    }

    // Show dialog for name if no stored data
    console.log('❓ No stored user data, showing join dialog');
    ui.setShowJoinDialog(true);
  }, [socket, isConnected, roomId, core, ui, lastJoinAttempt]);

  // Apply initial video from query params
  useEffect(() => {
    if (!core.room || !core.currentUser?.isHost) return;
    if (!initialVideoUrlFromQuery || initialVideoAppliedRef.current) return;

    if (!core.room.videoUrl) {
      handleSetVideo(initialVideoUrlFromQuery);
      initialVideoAppliedRef.current = true;
    }
  }, [core.room, core.currentUser, initialVideoUrlFromQuery, handleSetVideo]);

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
      if (core.currentUser?.isHost) {
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
  }, [socket, syncVideo, core.currentUser?.isHost]);

  // Start/stop sync check based on host status
  useEffect(() => {
    if (core.currentUser?.isHost && core.room?.videoUrl) {
      console.log('🎯 Starting sync check - user is host');
      startSyncCheck();
    } else {
      console.log('🛑 Stopping sync check - user is not host or no video');
      stopSyncCheck();
    }

    return () => {
      stopSyncCheck();
    };
  }, [core.currentUser?.isHost, core.room?.videoUrl, startSyncCheck, stopSyncCheck]);

  // Load video on Chromecast when casting becomes active
  useEffect(() => {
    if (!isCasting || !core.room?.videoUrl) return;

    if (core.room.videoType === 'youtube') return;

    console.log('📺 Loading video on Chromecast:', core.room.videoUrl);
    const contentType = core.room.videoType === 'm3u8' ? 'application/x-mpegurl' : 'video/mp4';
    startCasting(core.room.videoUrl, contentType);
  }, [isCasting, core.room?.videoUrl, core.room?.videoType, startCasting]);

  // Autoplay effect
  useEffect(() => {
    if (!core.room || !core.currentUser?.isHost) return;
    if (autoplayTriggeredRef.current) return;
    if (autoplayParam !== '1') return;

    const hasVideo = !!core.room.videoUrl || !!core.room.videoMeta?.playbackUrl;
    if (!hasVideo) return;

    const player = getActivePlayer();
    if (!player) return;

    autoplayTriggeredRef.current = true;

    try {
      const maybePromise = (player as YouTubePlayerRef | VideoPlayerRef | HLSPlayerRef).play?.();
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise
          .then(() => {
            handleVideoPlay();
          })
          .catch(() => {
            // Autoplay blocked
          });
      } else {
        handleVideoPlay();
      }
    } catch {
      // Ignore autoplay errors
    }
  }, [core.room, core.currentUser, autoplayParam, getActivePlayer, handleVideoPlay]);

  // Handle errors
  if (core.error) {
    return <ErrorDisplay error={core.error} onRetry={() => router.push('/join')} />;
  }

  // Handle loading state - but show join dialog or passcode dialog if needed
  if (!core.room || !core.currentUser) {
    if (ui.showJoinDialog) {
      return (
        <>
          <LoadingDisplay roomId={roomId} />
          <JoinRoomDialog
            open={ui.showJoinDialog}
            roomId={roomId}
            onJoin={ui.handleJoinWithName}
            onCancel={ui.handleCancelJoin}
          />
        </>
      );
    }
    if (ui.showPasscodeDialog) {
      return (
        <>
          <LoadingDisplay roomId={roomId} />
          <PasscodeDialog
            open={ui.showPasscodeDialog}
            roomId={roomId}
            error={ui.passcodeError}
            isLoading={ui.isVerifyingPasscode}
            onSubmit={ui.handleVerifyPasscode}
            onCancel={ui.handleCancelPasscode}
          />
        </>
      );
    }
    return <LoadingDisplay roomId={roomId} />;
  }

  const meta = core.room.videoMeta;
  const effectiveVideoUrl = meta?.playbackUrl ?? core.room.videoUrl;
  const effectiveVideoType = meta?.videoType ?? core.room.videoType ?? undefined;

  const extractYouTubeId = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    try {
      if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
      const u = new URL(url);
      if (u.hostname.includes('youtu.be')) {
        const id = u.pathname.slice(1);
        return id || undefined;
      }
      const v = u.searchParams.get('v');
      if (v) return v;
      const embedMatch = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return embedMatch[1];
      return undefined;
    } catch {
      return undefined;
    }
  };
  const youTubeId = effectiveVideoType === 'youtube' ? extractYouTubeId(effectiveVideoUrl) : undefined;

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 4xl:max-w-screen-3xl">
      {/* Room Header */}
      <RoomHeader
        roomId={roomId}
        hostName={core.room.hostName}
        hostCount={core.room.users.filter(u => u.isHost).length}
        isHost={core.currentUser.isHost}
        showCopied={ui.showCopied}
        onCopyRoomId={ui.copyRoomId}
        onShareRoom={ui.shareRoom}
        onOpenSettings={() => ui.setShowSettingsDialog(true)}
      />

      {/* Sync Error */}
      {core.syncError && <SyncError error={core.syncError} />}

      {/* Guest Info Banner */}
      {ui.showGuestInfoBanner && !core.currentUser.isHost && core.room.videoUrl && (
        <GuestInfoBanner
          onLearnMore={() => ui.setShowHostDialog(true)}
          onDismiss={() => ui.setShowGuestInfoBanner(false)}
        />
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        {/* Main Content */}
        <div className="col-span-full xl:col-span-3">
          <RoomVideoSection
            roomId={roomId}
            videoUrl={effectiveVideoUrl}
            videoType={effectiveVideoType}
            youTubeId={youTubeId}
            isHost={core.currentUser.isHost}
            hasVideo={!!core.room.videoUrl}
            originalVideoUrl={core.room.videoUrl}
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
            youtubePlayerRef={youtubePlayerRef}
            videoPlayerRef={videoPlayerRef}
            hlsPlayerRef={hlsPlayerRef}
            isCasting={isCasting}
            isCastAvailable={isCastAvailable && effectiveVideoType !== 'youtube'}
            castDeviceName={castDeviceName}
            onCastClick={() => {
              if (isCasting) {
                stopCasting();
              } else {
                requestCastSession();
              }
            }}
          />
        </div>

        {/* Chat */}
        <div className="col-span-full xl:col-span-1">
          <RoomChatSection
            messages={chat.messages}
            currentUserId={core.currentUser.id}
            users={core.room.users}
            typingUsers={chat.typingUsers}
            isChatLocked={core.room.settings?.isChatLocked}
            isHost={core.currentUser.isHost}
            voice={voiceProps}
            video={videoProps}
            onSendMessage={chat.handleSendMessage}
            onTypingStart={chat.handleTypingStart}
            onTypingStop={chat.handleTypingStop}
            onToggleReaction={chat.handleToggleReaction}
            onTimestampClick={handleChatTimestampClick}
          />
        </div>

        {/* Video Chat Grid */}
        {videochat.isEnabled && (
          <div className="col-span-full mx-6 mt-4">
            <VideoChatGrid
              localStream={videochat.localStream}
              remoteStreams={videochat.remoteStreams}
              currentUserId={core.currentUser.id}
              isCameraOff={videochat.isCameraOff}
              users={core.room.users}
              className="w-full"
            />
            <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
              {videochat.isConnecting && <Spinner variant="ellipsis" />}
              {videochat.error && <span className="text-destructive">{videochat.error}</span>}
            </div>
          </div>
        )}

        <UserList
          users={core.room.users}
          currentUserId={core.currentUser.id}
          currentUserIsHost={core.currentUser.isHost}
          onPromoteUser={core.handlePromoteUser}
          onKickUser={core.handleKickUser}
          speakingUserIds={voice.speakingUserIds}
          className="col-span-full mt-4 rounded-md"
        />
      </div>

      {/* Dialogs */}
      <RoomDialogs
        roomId={roomId}
        roomSettings={core.room.settings}
        showHostDialog={ui.showHostDialog}
        onHostDialogChange={ui.setShowHostDialog}
        showJoinDialog={ui.showJoinDialog}
        onJoin={ui.handleJoinWithName}
        onCancelJoin={ui.handleCancelJoin}
        showPasscodeDialog={ui.showPasscodeDialog}
        passcodeError={ui.passcodeError}
        isVerifyingPasscode={ui.isVerifyingPasscode}
        onVerifyPasscode={ui.handleVerifyPasscode}
        onCancelPasscode={ui.handleCancelPasscode}
        showSettingsDialog={ui.showSettingsDialog}
        onSettingsDialogChange={ui.setShowSettingsDialog}
        onUpdateSettings={core.handleUpdateRoomSettings}
      />

      <RoomChatOverlaySection
        messages={chat.messages}
        currentUserId={core.currentUser.id}
        users={core.room.users}
        typingUsers={chat.typingUsers}
        isChatLocked={core.room.settings?.isChatLocked}
        isHost={core.currentUser.isHost}
        voice={voiceProps}
        video={videoProps}
        isVisible={showChatOverlay}
        isMinimized={isChatMinimized}
        onSendMessage={chat.handleSendMessage}
        onTypingStart={chat.handleTypingStart}
        onTypingStop={chat.handleTypingStop}
        onToggleReaction={chat.handleToggleReaction}
        onTimestampClick={handleChatTimestampClick}
        onToggleMinimize={toggleChatMinimize}
        onClose={closeChatOverlay}
        onMarkMessagesAsRead={chat.markMessagesAsRead}
      />

      {videochat.isEnabled && isFullscreen && (
        <VideoChatOverlay
          isVisible={true}
          localStream={videochat.localStream}
          remoteStreams={videochat.remoteStreams}
          currentUserId={core.currentUser.id}
          isCameraOff={videochat.isCameraOff}
          users={core.room.users}
          portalContainer={fullscreenPortalContainer}
        />
      )}

      <LeaveRoomGuard roomId={roomId} room={core.room} socket={socket} />
    </div>
  );
}
