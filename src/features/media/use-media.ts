'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/src/core/socket';
import { logDebug } from '@/src/core/logger';
import { toast } from 'sonner';
import { useMediaRoom } from '@sideby-me/rtc/react';
import type { MediaTokenResponse, SfuSession } from '@sideby-me/rtc';

// ── SDK version shim ───────────────────────────────────────────────────────────
// getSnapshot() is available in @sideby-me/rtc (media-sdk ≥0.2.0-era). This local type allows the
// duck-type guard in the session effect to compile without requiring the new
// package version to be installed. Remove once watch requires ≥0.2.0.
type SfuSessionWithSnapshot = SfuSession & {
  getSnapshot(): Array<{
    participantId: string;
    audioTrack: MediaStreamTrack | null;
    videoTrack: MediaStreamTrack | null;
  }>;
};

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
    /** True when the remote peer has paused their audio producer (wire-level mute). */
    isAudioMuted: boolean;
    /** True when the remote peer has paused their video producer (shows avatar, not black). */
    isVideoMuted: boolean;
  }>;
  // Speaking (keyed by opaque participantId from SDK audioLevel event — D-03)
  speakingParticipantIds: Set<string>;
  // Participant count (remoteParticipants.length + 1 when connected)
  participantCount: number;
  // Room-wide, presence-driven per-kind counts (B-01 / B-03). Sourced from the sync
  // `sfu-media-count` broadcast — independent of whether the LOCAL user is on that call,
  // so a non-participant sees who is on each call and counts survive local teardown.
  audioParticipantCount: number;
  videoParticipantCount: number;
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

const CALL_FULL_PATTERNS = [/room.+full/i, /capacity/i, /max.+participant/i, /participant.+limit/i, /cap.+reach/i];

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
      s.once('media-token', data => resolve(data as MediaTokenResponse));
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

  // Lazy lifecycle: SDK session connects only when mic OR camera is active (D-02).
  // Decision: sdkEnabled = mic OR camera so that a mic-only participant STILL connects a
  // session (voice needs the SFU transport). The VIDEO grid is gated separately on LOCAL
  // camera participation (in RoomShell) per D-06: "a remote camera tile renders only after
  // the LOCAL user has joined the video call." A voice-only participant consumes remote
  // producers pushed by the SFU on join (SDK/SFU behavior, intentional) but does NOT render
  // the camera grid — that bandwidth optimization is deferred, not part of this fix. (GAP C2)
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
  const {
    session,
    state: sdkState,
    error: sdkError,
  } = useMediaRoom({
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
  // W3: per-participant mute state driven by SDK trackMuted events (producer-paused/resumed).
  const [mutedTrackKinds, setMutedTrackKinds] = useState<Map<string, Set<'audio' | 'video'>>>(new Map());

  // B-04(b): per-participant decay timers for the speaking ring. The SFU's
  // AudioLevelObserver only emits 'volumes' for the loudest few speakers and sends
  // NO silence signal, so a participant who stops talking never gets a "not speaking"
  // event — the ring would stick on until they leave. Each audioLevel event (re)arms a
  // timer that clears the participant after SPEAKING_DECAY_MS of no further events.
  const speakingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // B-01 / B-03: room-wide presence-driven per-kind counts from sync's broadcast.
  const [audioParticipantCount, setAudioParticipantCount] = useState(0);
  const [videoParticipantCount, setVideoParticipantCount] = useState(0);

  useEffect(() => {
    if (!session) return;

    // Capture the stable timers map for the cleanup closure (B-04b) so the cleanup
    // doesn't read speakingTimersRef.current at teardown time (react-hooks lint).
    const speakingTimers = speakingTimersRef.current;

    // Named handlers registered with typed wrappers; cast to the generic overload
    // that session.on/off accepts ((...args: unknown[]) => void).
    const handleParticipantJoined = (...args: unknown[]) => {
      const participantId = args[0] as string;
      logDebug('other', 'participant_joined', '[useMedia] participantJoined', { participantId });
      setRemoteParticipantIds(prev => (prev.includes(participantId) ? prev : [...prev, participantId]));
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
      // B-04(b): drop any pending decay timer for the departed participant.
      const timer = speakingTimersRef.current.get(participantId);
      if (timer) {
        clearTimeout(timer);
        speakingTimersRef.current.delete(participantId);
      }
      setMutedTrackKinds(prev => {
        const next = new Map(prev);
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
          track.kind === 'audio' ? { ...existing, audio: track } : { ...existing, video: track };
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
        const updated: TrackEntry = kind === 'audio' ? { ...existing, audio: null } : { ...existing, video: null };
        return new Map(prev).set(participantId, updated);
      });
      // Clear mute state for the unsubscribed kind (track no longer exists).
      setMutedTrackKinds(prev => {
        const kinds = prev.get(participantId);
        if (!kinds?.has(kind as 'audio' | 'video')) return prev;
        const next = new Map(prev);
        const newKinds = new Set(kinds);
        newKinds.delete(kind as 'audio' | 'video');
        if (newKinds.size === 0) next.delete(participantId);
        else next.set(participantId, newKinds);
        return next;
      });
    };

    const handleTrackMuted = (...args: unknown[]) => {
      const participantId = args[0] as string;
      const kind = args[1] as string;
      const muted = args[2] as boolean;
      logDebug('other', 'track_muted', '[useMedia] trackMuted', { participantId, kind, muted });
      // W3: track mute state per-participant so the UI can show avatar instead of
      // a black tile when a remote peer pauses their video producer.
      setMutedTrackKinds(prev => {
        const next = new Map(prev);
        const kinds = new Set(next.get(participantId));
        if (muted) kinds.add(kind as 'audio' | 'video');
        else kinds.delete(kind as 'audio' | 'video');
        if (kinds.size === 0) next.delete(participantId);
        else next.set(participantId, kinds);
        return next;
      });
    };

    // D-03: speaking driven ONLY by SDK audioLevel event — no Web Audio analyser, no rAF loop.
    // mediasoup AudioLevelObserver reports volume in dBov (negative; ~−127…0; closer to 0 =
    // louder). The SFU and SDK forward the raw dBov value without normalisation. −60 dBov is
    // comfortably above the observer's −70 threshold (which filters background noise/silence)
    // and below the 0 floor — active speech is typically −50…−20 dBov.
    // Discord-like responsiveness (B-04b tuning). The SFU AudioLevelObserver now samples
    // every ~200ms (was 800ms). The observer floor is -70 dBov; -65 here lets moderate
    // speech light the ring (was -60, which filtered out speech the SFU already reported)
    // while still ignoring background noise.
    const SPEAKING_DBOV_THRESHOLD = -65;
    // Decay window must exceed the SFU sample interval (~200ms) so an actively-speaking peer
    // stays lit between ticks and through brief word gaps, but releases quickly (~500ms) once
    // they actually stop — the SFU sends no per-speaker silence signal, so the client decays.
    const SPEAKING_DECAY_MS = 500;
    const clearSpeaking = (participantId: string) => {
      speakingTimersRef.current.delete(participantId);
      setSpeakingParticipantIds(prev => {
        if (!prev.has(participantId)) return prev;
        const next = new Set(prev);
        next.delete(participantId);
        return next;
      });
    };
    const handleAudioLevel = (...args: unknown[]) => {
      const participantId = args[0] as string;
      const volume = args[1] as number;
      if (volume <= SPEAKING_DBOV_THRESHOLD) return; // below threshold — let the decay timer expire

      // (Re)arm the decay timer so the ring releases ~SPEAKING_DECAY_MS after the
      // last above-threshold tick (i.e. when the peer goes quiet).
      const existing = speakingTimersRef.current.get(participantId);
      if (existing) clearTimeout(existing);
      speakingTimersRef.current.set(
        participantId,
        setTimeout(() => clearSpeaking(participantId), SPEAKING_DECAY_MS)
      );

      setSpeakingParticipantIds(prev => {
        // Only allocate a new Set when membership actually changes (avoid re-rendering
        // the whole grid on every audio-level notification tick).
        if (prev.has(participantId)) return prev;
        const next = new Set(prev);
        next.add(participantId);
        return next;
      });
    };

    session.on('participantJoined', handleParticipantJoined);
    session.on('participantLeft', handleParticipantLeft);
    session.on('trackSubscribed', handleTrackSubscribed);
    session.on('trackUnsubscribed', handleTrackUnsubscribed);
    session.on('trackMuted', handleTrackMuted);
    session.on('audioLevel', handleAudioLevel);

    // Initial-connect timing fix: events fired during connect()'s existingProducers loop
    // are emitted before this useEffect runs (handlers not yet registered). Hydrate state
    // from the session snapshot immediately after registration so existing participants
    // are visible on B's first render, not just after the next reconnect.
    // Runtime guard: getSnapshot() is available in @sideby-me/rtc (media-sdk ≥0.2.0-era). The duck-type
    // check allows the same watch build to work against both old and new SDK versions
    // while the republish + reinstall is in flight.
    if (typeof (session as { getSnapshot?: unknown }).getSnapshot === 'function') {
      const snap = (session as SfuSessionWithSnapshot).getSnapshot();
      for (const { participantId, audioTrack, videoTrack } of snap) {
        handleParticipantJoined(participantId);
        if (audioTrack) handleTrackSubscribed(participantId, audioTrack);
        if (videoTrack) handleTrackSubscribed(participantId, videoTrack);
      }
    }

    return () => {
      session.off('participantJoined', handleParticipantJoined);
      session.off('participantLeft', handleParticipantLeft);
      session.off('trackSubscribed', handleTrackSubscribed);
      session.off('trackUnsubscribed', handleTrackUnsubscribed);
      session.off('trackMuted', handleTrackMuted);
      session.off('audioLevel', handleAudioLevel);
      // B-04(b): cancel all pending speaking-decay timers for this session.
      speakingTimers.forEach(clearTimeout);
      speakingTimers.clear();
    };
  }, [session]);

  // ── publish-on-session-connect refs (GAP A2) ──────────────────────────────
  // publishedRef tracks which track kinds are currently published to the LIVE session.
  // Flags reset on session teardown and set after each successful publish — deduping the
  // enable-handler path and the effect below so no track is double-published. (T-04-22)
  const publishedRef = useRef<{ audio: boolean; video: boolean }>({ audio: false, video: false });

  // Mirror active-state booleans into refs so the publish effect can read the latest values
  // without stale closures (the effect is keyed only on [session]).
  const isMicActiveRef = useRef(false);
  const isCameraActiveRef = useRef(false);
  useEffect(() => {
    isMicActiveRef.current = isMicActive;
  }, [isMicActive]);
  useEffect(() => {
    isCameraActiveRef.current = isCameraActive;
  }, [isCameraActive]);

  // ── publish-on-session-connect effect (GAP A2) ────────────────────────────
  // When session becomes non-null (initial connect OR fresh session after reconnect),
  // (re)publish any local tracks that were enabled before the session existed.
  // When session becomes null (disconnect), reset the published flags so the next
  // session object triggers a full re-publish.
  useEffect(() => {
    if (!session) {
      publishedRef.current = { audio: false, video: false };
      return;
    }
    // Fresh session — reset flags for this session object, then publish active tracks.
    publishedRef.current = { audio: false, video: false };

    const doPublish = async () => {
      // Publish mic if active and not yet published to this session
      if (isMicActiveRef.current && !publishedRef.current.audio) {
        const audioTrack = localStreamRef.current?.getAudioTracks()[0] ?? null;
        if (audioTrack) {
          try {
            await session.publishMic(audioTrack);
            publishedRef.current.audio = true;
            logDebug('other', 'publish_on_connect_audio', '[useMedia] published mic on session connect');
          } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            logDebug('other', 'publish_on_connect_audio_error', '[useMedia] publishMic on connect failed', {
              error: e.message,
            });
            toast.error('Microphone error', { description: e.message });
          }
        }
      }
      // Publish camera if active and not yet published to this session
      if (isCameraActiveRef.current && !publishedRef.current.video) {
        const videoTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
        if (videoTrack) {
          try {
            await session.publishCamera(videoTrack);
            publishedRef.current.video = true;
            logDebug('other', 'publish_on_connect_video', '[useMedia] published camera on session connect');
          } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            logDebug('other', 'publish_on_connect_video_error', '[useMedia] publishCamera on connect failed', {
              error: e.message,
            });
            toast.error('Camera error', { description: e.message });
          }
        }
      }
    };

    doPublish();
    // session is the sole dep: fires on initial connect and on each fresh session after reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // Mark published so the session-connect effect doesn't double-publish (T-04-22)
        publishedRef.current.audio = true;
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
      try {
        await session.unpublishMic();
      } catch {
        /* ignore */
      }
    }
    // Clear the published flag so a future session reconnect re-publishes correctly
    publishedRef.current.audio = false;

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
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !next;
      });
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
        // Mark published so the session-connect effect doesn't double-publish (T-04-22)
        publishedRef.current.video = true;
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
      try {
        await session.unpublishCamera();
      } catch {
        /* ignore */
      }
    }
    // Clear the published flag so a future session reconnect re-publishes correctly
    publishedRef.current.video = false;

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
      localStreamRef.current.getVideoTracks().forEach(t => {
        t.enabled = !next;
      });
    }
  }, [isCameraOff, session]);

  // ── Reset token on disconnect (so next enable fetches a fresh one) ─────────
  useEffect(() => {
    if (!sdkEnabled) {
      setMediaTokenResponse(null);
      setRemoteParticipantIds([]);
      setTrackMap(new Map());
      setSpeakingParticipantIds(new Set());
      setMutedTrackKinds(new Map());
      // B-04(b): cancel pending decay timers so a stale timer can't re-clear later.
      speakingTimersRef.current.forEach(clearTimeout);
      speakingTimersRef.current.clear();
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
    []
  );

  // ── SFU media-presence: room-wide per-kind counts (B-01 / B-03) ────────────
  // Listen for the sync `sfu-media-count` broadcast and request the current counts
  // on mount and on every (re)connect. This is independent of the SDK session, so a
  // user not on a call (pre-join) and a user whose session has torn down (post-leave)
  // still get correct counts — fixing the "0 even though a peer is on voice" bugs.
  useEffect(() => {
    const s = socket;
    if (!s) return;

    const handleCount = (data: { roomId: string; audioCount: number; videoCount: number }) => {
      if (data.roomId !== roomId) return;
      setAudioParticipantCount(data.audioCount);
      setVideoParticipantCount(data.videoCount);
    };
    const requestCount = () => s.emit('request-sfu-media-count', { roomId });

    s.on('sfu-media-count', handleCount);
    s.on('connect', requestCount);
    if (s.connected) requestCount();

    return () => {
      s.off('sfu-media-count', handleCount);
      s.off('connect', requestCount);
    };
  }, [socket, roomId]);

  // Announce this socket's own per-kind membership whenever mic/camera state changes,
  // and re-announce on (re)connect so socket.io room membership is restored after a
  // dropped connection (the new socket starts in no rooms). Best-effort: the server
  // only honours presence once the join flow has populated socket.data.roomId.
  useEffect(() => {
    const s = socket;
    if (!s) return;

    const emitPresence = () => s.emit('sfu-media-presence', { roomId, audio: isMicActive, video: isCameraActive });

    s.on('connect', emitPresence);
    if (s.connected) emitPresence();

    return () => {
      s.off('connect', emitPresence);
    };
  }, [socket, roomId, isMicActive, isCameraActive]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const remoteParticipants = remoteParticipantIds.map(participantId => {
    const entry = trackMap.get(participantId) ?? { audio: null, video: null };
    const mutedKinds = mutedTrackKinds.get(participantId) ?? new Set<'audio' | 'video'>();
    return {
      participantId,
      audioTrack: entry.audio,
      videoTrack: entry.video,
      isAudioMuted: mutedKinds.has('audio'),
      isVideoMuted: mutedKinds.has('video'),
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
    audioParticipantCount,
    videoParticipantCount,
  };
}
