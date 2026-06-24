'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/src/core/socket';
import { logDebug } from '@/src/core/logger';
import { toast } from 'sonner';
import { useMediaRoom } from '@sideby-me/media-sdk/react';
import type { MediaTokenResponse } from '@sideby-me/media-sdk';

// ── Return surface ─────────────────────────────────────────────────────────────

export interface UseMediaReturn {
  // Connection state
  state: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  /** True when the SFU room is at capacity and rejected the join (D-04). */
  isCallFull: boolean;
  /** Own opaque participantId from the media token (undefined until the first token fetch). */
  localParticipantId: string | undefined;
  // Mic
  isMicActive: boolean;
  isMuted: boolean;
  enableMic: () => Promise<void>;
  disableMic: () => Promise<void>;
  toggleMute: () => void;
  // Camera
  isCameraActive: boolean;
  isCameraOff: boolean;
  enableCamera: () => Promise<void>;
  disableCamera: () => Promise<void>;
  toggleCamera: () => void;
  // Streams
  localStream: MediaStream | null;
  remoteParticipants: Array<{
    participantId: string;
    audioTrack: MediaStreamTrack | null;
    videoTrack: MediaStreamTrack | null;
  }>;
  // Speaking (keyed by opaque participantId from SDK audioLevel event — D-03)
  speakingParticipantIds: Set<string>;
  // Participant count (remoteParticipants.length + 1 when connected)
  participantCount: number;
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface UseMediaProps {
  roomId: string;
}

// ── Track map internal type ────────────────────────────────────────────────────

interface TrackEntry {
  audio: MediaStreamTrack | null;
  video: MediaStreamTrack | null;
}

// ── SFU cap error detection (D-04) ────────────────────────────────────────────

const CALL_FULL_PATTERNS = [
  /room.+full/i,
  /capacity/i,
  /max.+participant/i,
  /participant.+limit/i,
  /cap.+reach/i,
];

function isCallFullError(err: Error): boolean {
  return CALL_FULL_PATTERNS.some(p => p.test(err.message));
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useMedia({ roomId }: UseMediaProps): UseMediaReturn {
  const { socket } = useSocket();

  // Keep latest socket in a ref to avoid stale closure in getToken (Pitfall 1 / T-04-06)
  const socketRef = useRef(socket);
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  // ── getToken: stable useCallback([roomId]) — reads socket from ref at call time ──
  // This is both the initial token fetch and the SDK reconnect callback (RESEARCH #2).
  // MUST NOT be placed in any effect dep array (T-04-06 / D-06 anti-reconnect-storm).
  const getToken = useCallback((): Promise<MediaTokenResponse> => {
    return new Promise((resolve, reject) => {
      const s = socketRef.current;
      if (!s) {
        reject(new Error('no socket'));
        return;
      }
      // SocketEvents now includes media-token / media-token-error / request-media-token
      s.once('media-token', (data) => resolve(data as MediaTokenResponse));
      s.once('media-token-error', ({ error }: { error: string }) => reject(new Error(error)));
      s.emit('request-media-token', { roomId });
    });
  }, [roomId]);

  // ── Initial token fetch ────────────────────────────────────────────────────
  const [mediaTokenResponse, setMediaTokenResponse] = useState<MediaTokenResponse | null>(null);

  // ── Mic + camera active state ──────────────────────────────────────────────
  const [isMicActive, setIsMicActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // Lazy lifecycle: SDK session connects only when mic OR camera is active (D-02)
  const sdkEnabled = isMicActive || isCameraActive;

  // ── Fetch initial token once when sdkEnabled flips true ───────────────────
  useEffect(() => {
    if (!sdkEnabled || mediaTokenResponse) return;
    getToken()
      .then(setMediaTokenResponse)
      .catch((err: Error) => {
        logDebug('other', 'initial_token_error', '[useMedia] initial getToken failed', { error: err.message });
        toast.error('Media error', { description: err.message });
      });
  // getToken is intentionally excluded from deps (stable ref, T-04-06)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkEnabled, mediaTokenResponse]);

  // ── Connect via SDK ────────────────────────────────────────────────────────
  const { session, state: sdkState, error: sdkError } = useMediaRoom({
    url: mediaTokenResponse?.sfuUrl ?? '',
    token: mediaTokenResponse?.token ?? '',
    getToken,
    enabled: sdkEnabled && !!mediaTokenResponse,
  });

  // ── Call-full detection (D-04): surface SFU cap rejection as distinct state ─
  const isCallFull = sdkError ? isCallFullError(sdkError) : false;
  const error = sdkError && !isCallFull ? sdkError : null;

  // ── Remote participants + track map ───────────────────────────────────────
  const [remoteParticipantIds, setRemoteParticipantIds] = useState<string[]>([]);
  const [trackMap, setTrackMap] = useState<Map<string, TrackEntry>>(new Map());
  const [speakingParticipantIds, setSpeakingParticipantIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!session) return;

    // Named handlers registered with typed wrappers; cast to the generic overload
    // that session.on/off accepts ((...args: unknown[]) => void).
    const handleParticipantJoined = (...args: unknown[]) => {
      const participantId = args[0] as string;
      logDebug('other', 'participant_joined', '[useMedia] participantJoined', { participantId });
      setRemoteParticipantIds(prev =>
        prev.includes(participantId) ? prev : [...prev, participantId]
      );
    };

    const handleParticipantLeft = (...args: unknown[]) => {
      const participantId = args[0] as string;
      logDebug('other', 'participant_left', '[useMedia] participantLeft', { participantId });
      setRemoteParticipantIds(prev => prev.filter(id => id !== participantId));
      setTrackMap(prev => {
        const next = new Map(prev);
        next.delete(participantId);
        return next;
      });
      setSpeakingParticipantIds(prev => {
        const next = new Set(prev);
        next.delete(participantId);
        return next;
      });
    };

    const handleTrackSubscribed = (...args: unknown[]) => {
      const participantId = args[0] as string;
      const track = args[1] as MediaStreamTrack;
      logDebug('other', 'track_subscribed', '[useMedia] trackSubscribed', { participantId, kind: track.kind });
      setTrackMap(prev => {
        const existing = prev.get(participantId) ?? { audio: null, video: null };
        const updated: TrackEntry =
          track.kind === 'audio'
            ? { ...existing, audio: track }
            : { ...existing, video: track };
        return new Map(prev).set(participantId, updated);
      });
    };

    const handleTrackUnsubscribed = (...args: unknown[]) => {
      const participantId = args[0] as string;
      const kind = args[1] as string;
      logDebug('other', 'track_unsubscribed', '[useMedia] trackUnsubscribed', { participantId, kind });
      setTrackMap(prev => {
        const existing = prev.get(participantId);
        if (!existing) return prev;
        const updated: TrackEntry =
          kind === 'audio'
            ? { ...existing, audio: null }
            : { ...existing, video: null };
        return new Map(prev).set(participantId, updated);
      });
    };

    const handleTrackMuted = (...args: unknown[]) => {
      const participantId = args[0] as string;
      const kind = args[1] as string;
      const muted = args[2] as boolean;
      logDebug('other', 'track_muted', '[useMedia] trackMuted', { participantId, kind, muted });
      // Track mute state is reflected in the track's enabled flag by mediasoup-client
    };

    // D-03: speaking driven ONLY by SDK audioLevel event — no Web Audio analyser, no rAF loop
    const handleAudioLevel = (...args: unknown[]) => {
      const participantId = args[0] as string;
      const volume = args[1] as number;
      setSpeakingParticipantIds(prev => {
        const next = new Set(prev);
        if (volume > 0.05) next.add(participantId);
        else next.delete(participantId);
        return next;
      });
    };

    session.on('participantJoined', handleParticipantJoined);
    session.on('participantLeft', handleParticipantLeft);
    session.on('trackSubscribed', handleTrackSubscribed);
    session.on('trackUnsubscribed', handleTrackUnsubscribed);
    session.on('trackMuted', handleTrackMuted);
    session.on('audioLevel', handleAudioLevel);

    return () => {
      session.off('participantJoined', handleParticipantJoined);
      session.off('participantLeft', handleParticipantLeft);
      session.off('trackSubscribed', handleTrackSubscribed);
      session.off('trackUnsubscribed', handleTrackUnsubscribed);
      session.off('trackMuted', handleTrackMuted);
      session.off('audioLevel', handleAudioLevel);
    };
  }, [session]);

  // ── Local stream ref (for camera light off on unmount) ─────────────────────
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStreamState] = useState<MediaStream | null>(null);

  // ── Mic controls ──────────────────────────────────────────────────────────

  const enableMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error('No audio track');

      if (!localStreamRef.current) {
        localStreamRef.current = new MediaStream();
      }
      localStreamRef.current.addTrack(track);
      setLocalStreamState(new MediaStream(localStreamRef.current.getTracks()));

      setIsMicActive(true);
      setIsMuted(false);

      if (session) {
        await session.publishMic(track);
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logDebug('other', 'enable_mic_error', '[useMedia] enableMic failed', { error: e.message });
      toast.error('Microphone error', { description: e.message });
    }
  }, [session]);

  const disableMic = useCallback(async () => {
    setIsMicActive(false);
    setIsMuted(false);

    if (session) {
      try { await session.unpublishMic(); } catch { /* ignore */ }
    }

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.stop();
        localStreamRef.current?.removeTrack(t);
      });
      const remaining = localStreamRef.current.getTracks();
      setLocalStreamState(remaining.length > 0 ? new MediaStream(remaining) : null);
    }
  }, [session]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    if (session) {
      session.muteMic(next).catch((err: unknown) => {
        logDebug('other', 'mute_mic_error', '[useMedia] muteMic failed', { error: String(err) });
      });
    }
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
    }
  }, [isMuted, session]);

  // ── Camera controls ───────────────────────────────────────────────────────

  const enableCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('No video track');

      if (!localStreamRef.current) {
        localStreamRef.current = new MediaStream();
      }
      localStreamRef.current.addTrack(track);
      setLocalStreamState(new MediaStream(localStreamRef.current.getTracks()));

      setIsCameraActive(true);
      setIsCameraOff(false);

      if (session) {
        await session.publishCamera(track);
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logDebug('other', 'enable_camera_error', '[useMedia] enableCamera failed', { error: e.message });
      toast.error('Camera error', { description: e.message });
    }
  }, [session]);

  const disableCamera = useCallback(async () => {
    setIsCameraActive(false);
    setIsCameraOff(true);

    if (session) {
      try { await session.unpublishCamera(); } catch { /* ignore */ }
    }

    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => {
        t.stop();
        localStreamRef.current?.removeTrack(t);
      });
      const remaining = localStreamRef.current.getTracks();
      setLocalStreamState(remaining.length > 0 ? new MediaStream(remaining) : null);
    }
  }, [session]);

  const toggleCamera = useCallback(() => {
    const next = !isCameraOff;
    setIsCameraOff(next);
    if (session) {
      session.muteCamera(next).catch((err: unknown) => {
        logDebug('other', 'mute_camera_error', '[useMedia] muteCamera failed', { error: String(err) });
      });
    }
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !next; });
    }
  }, [isCameraOff, session]);

  // ── Reset token on disconnect (so next enable fetches a fresh one) ─────────
  useEffect(() => {
    if (!sdkEnabled) {
      setMediaTokenResponse(null);
      setRemoteParticipantIds([]);
      setTrackMap(new Map());
      setSpeakingParticipantIds(new Set());
    }
  }, [sdkEnabled]);

  // ── Unmount cleanup: stop any local getUserMedia tracks (D-02, SDK-08) ─────
  // SDK session.disconnect() is handled by useMediaRoom cleanup; we only stop
  // local MediaStream tracks the hook itself holds.
  useEffect(
    () => () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    },
    [],
  );

  // ── Derived state ─────────────────────────────────────────────────────────

  const remoteParticipants = remoteParticipantIds.map(participantId => {
    const entry = trackMap.get(participantId) ?? { audio: null, video: null };
    return {
      participantId,
      audioTrack: entry.audio,
      videoTrack: entry.video,
    };
  });

  const isConnected = sdkState === 'connected';
  const isConnecting = sdkState === 'connecting' || sdkState === 'reconnecting';
  const participantCount = isConnected ? remoteParticipants.length + 1 : 0;
  const localParticipantId = mediaTokenResponse?.participantId;

  return {
    state: sdkState,
    isConnected,
    isConnecting,
    error,
    isCallFull,
    localParticipantId,
    isMicActive,
    isMuted,
    enableMic,
    disableMic,
    toggleMute,
    isCameraActive,
    isCameraOff,
    enableCamera,
    disableCamera,
    toggleCamera,
    localStream,
    remoteParticipants,
    speakingParticipantIds,
    participantCount,
  };
}
