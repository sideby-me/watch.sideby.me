'use client';

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSocket } from '@/src/core/socket';
import { useRoomCore } from '@/src/features/room/hooks/use-room-core';
import { useRoomUiState } from '@/src/features/room/hooks/use-room-ui-state';
import { useChat } from '@/src/features/chat/hooks/use-chat';
import { useVideoSync } from '@/src/features/video-sync/hooks';
import { extractYouTubeId } from '@/src/features/video-sync/lib';
import { useSubtitles } from '@/src/features/subtitles/hooks';
import { getVideoIdForStorage } from '@/src/features/subtitles/lib';
import { useKeyboardShortcuts } from '@/src/core/input';
import { useFullscreenChatOverlay } from '@/src/features/chat/hooks';
import { useFullscreenPortalContainer, useRoomInitialization } from '@/src/features/room/hooks';
import { useVoiceChat } from '@/src/features/media/voice';
import { useVideoChat } from '@/src/features/media/videochat';
import { useGoogleCast } from '@/src/features/media/cast';
import { YouTubePlayerRef } from '@/src/core/video/youtube-player';
import { VideoPlayerRef } from '@/src/features/video-sync/components/VideoPlayer';
import { HLSPlayerRef } from '@/src/core/video/hls-player';
import { formatTimestamp } from '@/src/lib/chat-timestamps';
import { VOICE_MAX_PARTICIPANTS } from '@/src/lib/constants';

import { RoomHeader } from './RoomHeader';
import { RoomVideoSection } from './RoomVideoSection';
import { RoomChatSection, RoomChatOverlaySection } from './RoomChatSection';
import { RoomDialogs } from './RoomDialogs';

import { ErrorDisplay, LoadingDisplay, SyncError, GuestInfoBanner } from './RoomStatus';
import { UserList } from './UserList';
import { VideoChatGrid } from './VideoChatGrid';
import { VideoChatOverlay } from './VideoChatOverlay';
import { LeaveRoomGuard } from './leave-room-guard';
import { JoinRoomDialog } from './join-room-dialog';
import { PasscodeDialog } from './passcode-dialog';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { logDebug } from '@/src/core/logger';

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

  // Room initialization: auto-join, initial video from query, autoplay
  useRoomInitialization({
    roomId,
    socket,
    isConnected,
    room: core.room,
    currentUser: core.currentUser,
    isJoining: core.isJoining,
    hasAttemptedJoinRef: core.hasAttemptedJoinRef,
    emitJoinRoom: core.emitJoinRoom,
    setIsJoining: core.setIsJoining,
    setShowJoinDialog: ui.setShowJoinDialog,
    setPendingUserName,
    initialVideoUrl: searchParams.get('videoUrl'),
    autoplayParam: searchParams.get('autoplay'),
    initialVideoAppliedRef,
    autoplayTriggeredRef,
    handleSetVideo,
    getActivePlayer,
    handleVideoPlay,
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
      if (core.currentUser?.isHost) {
        return;
      }
      logDebug('video', 'sync_update', 'Received sync update from host');
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
      logDebug('video', 'sync_start', 'Starting sync check - user is host');
      startSyncCheck();
    } else {
      logDebug('video', 'sync_stop', 'Stopping sync check - user is not host or no video');
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

    logDebug('cast', 'load_video', `Loading video on Chromecast: ${core.room.videoUrl}`);
    const contentType = core.room.videoType === 'm3u8' ? 'application/x-mpegurl' : 'video/mp4';
    startCasting(core.room.videoUrl, contentType);
  }, [isCasting, core.room?.videoUrl, core.room?.videoType, startCasting]);

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
