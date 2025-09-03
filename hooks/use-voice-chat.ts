'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/hooks/use-socket';
import { useMediaPermissions } from '@/hooks/use-media-permissions';
import { useWebRTC } from '@/hooks/use-webrtc';
import { User } from '@/types';
import { toast } from 'sonner';

interface UseVoiceChatOptions {
  roomId: string;
  currentUser: User | null;
  maxParticipants?: number;
}
interface UseVoiceChatReturn {
  isEnabled: boolean;
  isMuted: boolean;
  isConnecting: boolean;
  error: string;
  activePeerIds: string[];
  publicParticipantCount: number;
  speakingUserIds: Set<string>;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  toggleMute: () => void;
}

const SOLO_USER_TIMEOUT = 120000; // 2 minutes

export function useVoiceChat({ roomId, currentUser, maxParticipants = 5 }: UseVoiceChatOptions): UseVoiceChatReturn {
  const { socket } = useSocket();
  const { requestMic } = useMediaPermissions();
  // Bridge cleanup via ref so we can pass callback before cleanupPeer is defined
  const cleanupPeerRef = useRef<(id: string) => void>(() => {});
  const fallbackInProgressRef = useRef<Set<string>>(new Set());
  const { getOrCreatePeer, removePeer, closeAll, forceTurnReconnect, safeAddRemoteCandidate } = useWebRTC({
    onIceCandidate: (peerId, candidate) => {
      if (!socket) return;
      socket.emit('voice-ice-candidate', { roomId, targetUserId: peerId, candidate });
    },
    onConnectionStateChange: (peerId, state, _pc, meta) => {
      if (state === 'failed') {
        if (meta.attempt < 3 && !fallbackInProgressRef.current.has(peerId)) {
          fallbackInProgressRef.current.add(peerId);
          (async () => {
            try {
              const local = await ensureLocalMic().catch(() => null);
              const newPc = await forceTurnReconnect(peerId, true);
              if (newPc && local) {
                const track = local.getAudioTracks()[0];
                if (track) {
                  const existingSenders = newPc.getSenders().filter(s => s.track && s.track.kind === 'audio');
                  if (existingSenders.length === 0) newPc.addTrack(track, local);
                  else {
                    try {
                      existingSenders[0].replaceTrack(track);
                    } catch {}
                  }
                }
              }
              if (newPc) {
                const offer = await newPc.createOffer({ offerToReceiveAudio: true });
                await newPc.setLocalDescription(offer);
                socket?.emit('voice-offer', { roomId, targetUserId: peerId, sdp: offer });
              }
            } catch {
              cleanupPeerRef.current(peerId);
            } finally {
              fallbackInProgressRef.current.delete(peerId);
            }
          })();
          return;
        }
        cleanupPeerRef.current(peerId);
        return;
      }
      if (state === 'closed' || state === 'disconnected') cleanupPeerRef.current(peerId);
    },
    onTrack: (peerId, ev) => {
      const stream = ev.streams[0];
      // Create or reuse hidden audio element
      let audioEl = remoteAudioElsRef.current.get(peerId);
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        audioEl.dataset.userId = peerId;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        remoteAudioElsRef.current.set(peerId, audioEl);
      }
      audioEl.srcObject = stream;
      attemptPlayback(audioEl, peerId);
      // Speaking detection for remote peer
      try {
        if (!audioContextRef.current) audioContextRef.current = new AudioContext();
        const ctx = audioContextRef.current;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((s, v) => s + v, 0) / data.length;
          const speaking = avg > 20;
          setSpeakingUserIds(prev => {
            const next = new Set(prev);
            speaking ? next.add(peerId) : next.delete(peerId);
            return next;
          });
          const entry = analyserNodesRef.current.get(peerId);
          const raf = requestAnimationFrame(tick);
          if (entry) entry.rafId = raf;
        };
        analyserNodesRef.current.set(peerId, { analyser, source: src, rafId: requestAnimationFrame(tick) });
      } catch {}
    },
  });

  const [isEnabled, setIsEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const [activePeerIds, setActivePeerIds] = useState<string[]>([]);
  const [publicParticipantCount, setPublicParticipantCount] = useState(0);
  const [speakingUserIds, setSpeakingUserIds] = useState<Set<string>>(new Set());

  // Media & negotiation refs
  const localStreamRef = useRef<MediaStream | null>(null); // Local microphone stream
  const appliedRemoteAnswerRef = useRef<Set<string>>(new Set()); // Guards against duplicate answer application
  const soloTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Auto-disconnect timer when alone
  const joinAttemptRef = useRef(false); // Prevents concurrent join attempts
  const audioContextRef = useRef<AudioContext | null>(null); // Shared AudioContext for speaking detection
  const analyserNodesRef = useRef<
    Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode; rafId: number | null }>
  >(new Map());
  const remoteAudioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const dlog = (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') console.log('[VOICE]', ...args);
  };

  // Attempt autoplay
  const attemptPlayback = (audioEl: HTMLAudioElement, userId: string) => {
    audioEl
      .play()
      .then(() => dlog('remote audio playing', { userId }))
      .catch(err => {
        dlog('remote audio play blocked', { userId, err: String(err) });
        toast.message('Enable audio', {
          description: `Your browser is trying to be helpful by blocking audio. Just click anywhere on the page to unmute everyone.`,
        });
      });
  };

  // Tear down a single peer
  const cleanupPeer = useCallback(
    (peerId: string) => {
      dlog('cleanupPeer', peerId);
      removePeer(peerId);
      setActivePeerIds(prev => prev.filter(id => id !== peerId));
      const audioEl = remoteAudioElsRef.current.get(peerId);
      if (audioEl) {
        try {
          audioEl.srcObject = null;
          audioEl.remove();
        } catch {}
        remoteAudioElsRef.current.delete(peerId);
      }
      // Ensure we allow future answers after rejoin
      appliedRemoteAnswerRef.current.delete(peerId);
      const analyserEntry = analyserNodesRef.current.get(peerId);
      if (analyserEntry) {
        if (analyserEntry.rafId) cancelAnimationFrame(analyserEntry.rafId);
        try {
          analyserEntry.source.disconnect();
        } catch {}
        analyserNodesRef.current.delete(peerId);
      }
      setSpeakingUserIds(prev => {
        if (!prev.has(peerId)) return prev;
        const next = new Set(prev);
        next.delete(peerId);
        return next;
      });
    },
    [removePeer]
  );
  // Keep ref up to date for connection state callback
  cleanupPeerRef.current = cleanupPeer;

  // Resets all state & refs for a clean future join
  const cleanupAll = useCallback(() => {
    dlog('cleanupAll');
    closeAll();
    setActivePeerIds([]);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setIsEnabled(false);
    setIsMuted(false);
    setIsConnecting(false);
    setError('');
    setPublicParticipantCount(0);
    // Reset signaling guards so a fresh join can negotiate cleanly
    appliedRemoteAnswerRef.current.clear();
    // Remove any lingering remote audio elements
    for (const [id, el] of remoteAudioElsRef.current.entries()) {
      try {
        el.srcObject = null;
        el.remove();
      } catch {}
      remoteAudioElsRef.current.delete(id);
    }
    for (const [id, e] of analyserNodesRef.current.entries()) {
      if (e.rafId) cancelAnimationFrame(e.rafId);
      try {
        e.source.disconnect();
      } catch {}
      analyserNodesRef.current.delete(id);
    }
    setSpeakingUserIds(new Set());
  }, [closeAll]);

  const clearSoloTimeout = useCallback(() => {
    if (soloTimeoutRef.current) {
      clearTimeout(soloTimeoutRef.current);
      soloTimeoutRef.current = null;
    }
  }, []);

  // Lazily acquire / memoize the local mic stream & wire speaking detection for self
  const ensureLocalMic = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await requestMic();
    if (!stream) throw new Error('mic-permission-denied');
    localStreamRef.current = stream;
    // Basic speaking detection (local)
    try {
      if (!audioContextRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current && currentUser?.id) {
        const ctx = audioContextRef.current;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const uid = currentUser.id;
        const tick = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((s, v) => s + v, 0) / data.length;
          const speaking = avg > 20;
          setSpeakingUserIds(prev => {
            const next = new Set(prev);
            speaking ? next.add(uid) : next.delete(uid);
            return next;
          });
          const id = requestAnimationFrame(tick);
          const entry = analyserNodesRef.current.get(uid);
          if (entry) entry.rafId = id;
        };
        analyserNodesRef.current.set(uid, { analyser, source, rafId: requestAnimationFrame(tick) });
      }
    } catch {}
    return stream;
  }, [currentUser?.id, requestMic]);

  // Begin joining voice chat, actual enable flips when server responds with existing peers
  const enable = useCallback(async () => {
    if (!socket || !currentUser) return;
    if (isEnabled || joinAttemptRef.current) return;
    setIsConnecting(true);
    joinAttemptRef.current = true;
    try {
      const stream = await ensureLocalMic();
      if (!stream) throw new Error('mic-failed');
      socket.emit('voice-join', { roomId });
    } catch (e) {
      setError(`Looks like you don't want to use your mic.`);
      setIsConnecting(false);
      joinAttemptRef.current = false;
      setIsEnabled(false);
    }
  }, [socket, currentUser, isEnabled, ensureLocalMic, roomId]);

  // Leave voice chat, performs orderly local teardown
  const disable = useCallback(async () => {
    if (!socket) return;
    if (isEnabled) socket.emit('voice-leave', { roomId });
    clearSoloTimeout();
    // Clear local speaking analyser to avoid stale RAF callbacks
    if (currentUser?.id) {
      const entry = analyserNodesRef.current.get(currentUser.id);
      if (entry) {
        if (entry.rafId) cancelAnimationFrame(entry.rafId);
        try {
          entry.source.disconnect();
        } catch {}
        analyserNodesRef.current.delete(currentUser.id);
        setSpeakingUserIds(prev => {
          const next = new Set(prev);
          next.delete(currentUser.id!);
          return next;
        });
      }
    }
    joinAttemptRef.current = false;
    cleanupAll();
  }, [socket, isEnabled, roomId, cleanupAll, clearSoloTimeout]);

  // (Bandwidth Patrol) schedule forced disconnect if alone for too long
  const startSoloTimeout = useCallback(() => {
    if (soloTimeoutRef.current) clearTimeout(soloTimeoutRef.current);
    soloTimeoutRef.current = setTimeout(() => {
      toast.error('🚨 Bandwidth Patrol', {
        description: 'Noah told me to end your lonely voice session to save bandwidth.',
      });
      disable();
    }, SOLO_USER_TIMEOUT);
  }, [disable]);

  // Flip enabled state of local audio tracks (ui level mute)
  const toggleMute = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    s.getAudioTracks().forEach(t => (t.enabled = !t.enabled));
    setIsMuted(m => !m);
  }, []);

  // Socket signaling handlers with SDP + ICE + peer roster + counts + errors
  useEffect(() => {
    if (!socket || !currentUser) return;

    // Server acceptance & initial peer roster -> initiator creates offers to sorted peers
    const handleExistingPeers = ({ userIds }: { userIds: string[] }) => {
      const others = userIds.filter(id => id !== currentUser.id).slice(0, Math.max(0, maxParticipants - 1));
      if (others.length === 0) startSoloTimeout();
      else clearSoloTimeout();
      if (!isEnabled) {
        setIsEnabled(true);
        setIsConnecting(false);
        joinAttemptRef.current = false;
      }
      others.sort().forEach(async id => {
        if (!activePeerIds.includes(id)) {
          const pc = await getOrCreatePeer(id, true);
          const local = await ensureLocalMic();
          const track = local.getAudioTracks()[0];
          if (track) {
            const existingSenders = pc.getSenders().filter(s => s.track && s.track.kind === 'audio');
            if (existingSenders.length === 0) {
              try {
                pc.addTrack(track, local);
              } catch {}
            }
          }
          const offer = await pc.createOffer({ offerToReceiveAudio: true });
          await pc.setLocalDescription(offer);
          socket.emit('voice-offer', { roomId, targetUserId: id, sdp: offer });
          setActivePeerIds(prev => (prev.includes(id) ? prev : [...prev, id]));
        }
      });
    };

    // Incoming offer -> set remote, add local track, produce answer
    const handleOffer = async ({ fromUserId, sdp }: { fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      if (fromUserId === currentUser.id) return;
      const pc = await getOrCreatePeer(fromUserId, false);
      if (pc.signalingState !== 'stable') return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      // Apply any queued candidates now remoteDescription is available
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (pc as any)._applyQueuedCandidates?.();
      const local = await ensureLocalMic();
      const track = local.getAudioTracks()[0];
      if (track) {
        const existingSenders = pc.getSenders().filter(s => s.track && s.track.kind === 'audio');
        if (existingSenders.length === 0) {
          try {
            pc.addTrack(track, local);
          } catch {}
        }
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('voice-answer', { roomId, targetUserId: fromUserId, sdp: answer });
      setActivePeerIds(prev => (prev.includes(fromUserId) ? prev : [...prev, fromUserId]));
    };

    // Incoming answer -> apply once
    const handleAnswer = async ({ fromUserId, sdp }: { fromUserId: string; sdp: RTCSessionDescriptionInit }) => {
      if (appliedRemoteAnswerRef.current.has(fromUserId)) return;
      const ids = activePeerIds;
      if (!ids.includes(fromUserId)) return;
      const pc = await getOrCreatePeer(fromUserId, true);
      if (pc.signalingState !== 'have-local-offer') return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      // Flush queued ICE
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (pc as any)._applyQueuedCandidates?.();
      appliedRemoteAnswerRef.current.add(fromUserId);
    };

    // Remote ICE candidate -> apply to existing peer connection
    const handleIce = async ({ fromUserId, candidate }: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      await safeAddRemoteCandidate(fromUserId, candidate);
    };

    // Peer left -> cleanup and possibly start solo timeout
    const handlePeerLeft = ({ userId }: { userId: string }) => {
      cleanupPeer(userId);
      const remaining = activePeerIds.filter(id => id !== userId);
      if (remaining.length === 0) startSoloTimeout();
    };

    // Server-side voice error -> surface toasts + reset pending join state
    const handleVoiceError = ({ error }: { error: string }) => {
      setError(error);
      toast.error('Voice chat error', { description: error });
      if (joinAttemptRef.current) {
        setIsConnecting(false);
        joinAttemptRef.current = false;
      }
    };

    // Broadcast participant count
    const handleCount = ({ roomId: r, count }: { roomId: string; count: number }) => {
      if (r === roomId) setPublicParticipantCount(count);
    };

    // New peer joined -> we're no longer alone, cancel pending bandwidth patrol
    const handlePeerJoined = ({ userId }: { userId: string }) => {
      if (userId && userId !== currentUser.id) {
        clearSoloTimeout();
      }
    };

    socket.on('voice-existing-peers', handleExistingPeers);
    socket.on('voice-offer-received', handleOffer);
    socket.on('voice-answer-received', handleAnswer);
    socket.on('voice-ice-candidate-received', handleIce);
    socket.on('voice-peer-left', handlePeerLeft);
    socket.on('voice-peer-joined', handlePeerJoined);
    socket.on('voice-error', handleVoiceError);
    socket.on('voice-participant-count', handleCount);
    return () => {
      socket.off('voice-existing-peers', handleExistingPeers);
      socket.off('voice-offer-received', handleOffer);
      socket.off('voice-answer-received', handleAnswer);
      socket.off('voice-ice-candidate-received', handleIce);
      socket.off('voice-peer-left', handlePeerLeft);
      socket.off('voice-peer-joined', handlePeerJoined);
      socket.off('voice-error', handleVoiceError);
      socket.off('voice-participant-count', handleCount);
    };
  }, [
    socket,
    currentUser,
    roomId,
    maxParticipants,
    isEnabled,
    activePeerIds,
    getOrCreatePeer,
    ensureLocalMic,
    cleanupPeer,
    startSoloTimeout,
    clearSoloTimeout,
  ]);

  useEffect(
    () => () => {
      clearSoloTimeout();
      cleanupAll();
    },
    [cleanupAll, clearSoloTimeout]
  );

  // Reactively manage solo timeout when peer roster changes (defensive redundancy)
  useEffect(() => {
    if (!isEnabled) {
      clearSoloTimeout();
      return;
    }
    if (activePeerIds.length === 0) startSoloTimeout();
    else clearSoloTimeout();
  }, [isEnabled, activePeerIds, startSoloTimeout, clearSoloTimeout]);

  return {
    isEnabled,
    isMuted,
    isConnecting,
    error,
    activePeerIds,
    speakingUserIds,
    publicParticipantCount,
    enable,
    disable,
    toggleMute,
  };
}
