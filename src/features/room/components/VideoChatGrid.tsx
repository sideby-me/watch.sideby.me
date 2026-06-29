'use client';
import React, { useEffect, useRef, useMemo } from 'react';
import { cn } from '@/src/lib/utils';
import { User } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Video, VideoOff } from 'lucide-react';

// ── New participantId-keyed prop shape (CUT-02, D-05/D-06) ────────────────────

interface VideoChatGridProps {
  localStream: MediaStream | null;
  /** Own participantId from the media token (undefined until first token fetch). */
  localParticipantId: string | undefined;
  isCameraOff: boolean;
  remoteParticipants: Array<{
    participantId: string;
    audioTrack: MediaStreamTrack | null;
    videoTrack: MediaStreamTrack | null;
    /** W3: true when the remote peer's video producer is paused (show avatar, not black). */
    isVideoMuted?: boolean;
  }>;
  /** Built from the sync roster — maps opaque participantId to the User record. */
  participantIdToUser: Map<string, User>;
  /** Set of participantIds currently speaking (from SDK audioLevel — D-03). */
  speakingParticipantIds: Set<string>;
  /** Name to display for the local user tile. */
  localUserName?: string;
  className?: string;
}

export const VideoChatGrid: React.FC<VideoChatGridProps> = ({
  localStream,
  localParticipantId,
  isCameraOff,
  remoteParticipants,
  participantIdToUser,
  speakingParticipantIds,
  localUserName,
  className,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // Wrap localStream video track in a MediaStream for the local tile srcObject
  const localVideoStream = useMemo(() => {
    if (!localStream) return null;
    const videoTracks = localStream.getVideoTracks();
    return videoTracks.length > 0 ? new MediaStream(videoTracks) : null;
  }, [localStream]);

  useEffect(() => {
    if (!isCameraOff && localVideoRef.current && localVideoStream) {
      if (localVideoRef.current.srcObject !== localVideoStream) {
        localVideoRef.current.srcObject = localVideoStream;
      }
    }
  }, [localVideoStream, isCameraOff]);

  const localCameraOff =
    isCameraOff ||
    !localStream ||
    !localStream.getVideoTracks().some(t => t.enabled && t.readyState === 'live');

  const localIsSpeaking =
    localParticipantId !== undefined && speakingParticipantIds.has(localParticipantId);

  // Local tile label: prefer provided name, fall back to "You"
  const localLabel = localUserName || 'You';

  return (
    <div className={cn('flex flex-wrap justify-center gap-2 rounded-md border border-border p-4', className)}>
      {/* Local tile */}
      <VideoTile
        local
        videoTrack={localVideoStream?.getVideoTracks()[0] ?? null}
        videoStream={localVideoStream}
        isOff={localCameraOff}
        name={localLabel}
        isSpeaking={localIsSpeaking}
        videoRef={localVideoRef}
      />

      {/* Remote tiles — only for participants with a camera track (W2: voice-only peers
          have no videoTrack and are excluded from the video grid). Within that set,
          isVideoMuted=true shows the avatar tile rather than a black frame (W3). */}
      {remoteParticipants.filter(p => p.videoTrack !== null).map(p => {
        const user = participantIdToUser.get(p.participantId);
        // D-06 graceful fallback: show first 6 chars of opaque id until roster catches up.
        // The full participantId is never surfaced as a label (T-04-11).
        const label = user?.name ?? p.participantId.slice(0, 6);
        const isSpeaking = speakingParticipantIds.has(p.participantId);
        // W3: isVideoMuted reflects server-side producer-paused state. When true, show
        // avatar instead of a black frame (the track exists but RTP is paused on the SFU).
        const videoTrackOff =
          !p.videoTrack ||
          p.videoTrack.readyState !== 'live' ||
          !p.videoTrack.enabled ||
          !!p.isVideoMuted;

        return (
          <VideoTile
            key={p.participantId}
            videoTrack={p.videoTrack}
            audioTrack={p.audioTrack}
            isOff={videoTrackOff}
            name={label}
            isSpeaking={isSpeaking}
          />
        );
      })}
    </div>
  );
};

// ── VideoTile ──────────────────────────────────────────────────────────────────

interface VideoTileProps {
  /** For remote tiles: the video MediaStreamTrack from the SDK. */
  videoTrack?: MediaStreamTrack | null;
  /** For remote tiles: the audio MediaStreamTrack (unused for srcObject but available). */
  audioTrack?: MediaStreamTrack | null;
  /** Pre-built MediaStream for the local tile (avoids redundant new MediaStream calls). */
  videoStream?: MediaStream | null;
  name?: string;
  isOff: boolean;
  local?: boolean;
  isSpeaking?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}

const initialsFromName = (name?: string) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase();

const VideoTile: React.FC<VideoTileProps> = ({
  videoTrack,
  videoStream,
  name,
  isOff,
  local,
  isSpeaking,
  videoRef,
}) => {
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const ref = videoRef || internalRef;

  // srcObject wiring: wrap videoTrack in a MediaStream for remote tiles (04-PATTERNS.md srcObject pattern)
  useEffect(() => {
    if (isOff || !ref.current) return;
    if (videoStream) {
      // Local tile: use the pre-built stream
      if (ref.current.srcObject !== videoStream) ref.current.srcObject = videoStream;
    } else if (videoTrack) {
      // Remote tile: re-attach ONLY when the video-track identity actually changes.
      // The previous guard `ref.current.srcObject !== stream` was always true (stream
      // was freshly allocated on every effect run), so srcObject was unconditionally
      // reassigned, dropping the decode pipeline and causing black-frame/stutter. (GAP B1)
      const attachedTrack = (ref.current.srcObject as MediaStream | null)?.getVideoTracks()[0];
      if (attachedTrack?.id !== videoTrack.id) {
        ref.current.srcObject = new MediaStream([videoTrack]);
      }
    }
  }, [videoTrack, videoStream, isOff, ref]);

  const initials = initialsFromName(name) || '??';

  return (
    <div
      className={cn(
        'group relative aspect-video w-full overflow-hidden rounded-md border bg-primary-50 sm:w-1/3 md:w-1/2 lg:w-1/4',
        // Speaking ring (D-03): SDK audioLevel drives the highlight
        isSpeaking ? 'border-primary ring-2 ring-primary/60' : 'border-border'
      )}
    >
      {!isOff && (videoStream || videoTrack) ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={local}
          className={cn('h-full w-full object-cover', local && 'scale-x-[-1]')}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Avatar size="lg">
            <AvatarFallback className="text-xs sm:text-sm">{initials}</AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-[10px] text-white">
        {isOff ? <VideoOff className="h-3 w-3" /> : <Video className="h-3 w-3" />}
        <span className="max-w-[70px] truncate">{local ? 'You' : name}</span>
      </div>
    </div>
  );
};
