'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createStunOnlyRTCConfiguration,
  createRTCConfiguration,
  createTurnOnlyRTCConfiguration,
} from '@/lib/ice-server';

export interface PeerMapEntry {
  pc: RTCPeerConnection;
  isUsingTurn: boolean;
  connectionAttempt: number;
  useOptimizedStrategy?: boolean;
}

export interface UseWebRTCOptions {
  // Fired when a local ICE candidate is gathered
  onIceCandidate?: (peerId: string, candidate: RTCIceCandidate) => void;
  // Fired when we create a local SDP offer (after setLocalDescription)
  onOffer?: (peerId: string, sdp: RTCSessionDescriptionInit) => void;
  // Fired when we create a local SDP answer (after setLocalDescription)
  onAnswer?: (peerId: string, sdp: RTCSessionDescriptionInit) => void;
  // Fired on any connection state change
  onConnectionStateChange?: (
    peerId: string,
    state: RTCPeerConnectionState,
    pc: RTCPeerConnection,
    meta: { usingTurn: boolean; attempt: number }
  ) => void;
  // Fired when a remote track is received
  onTrack?: (
    peerId: string,
    ev: RTCTrackEvent,
    pc: RTCPeerConnection,
    meta: { usingTurn: boolean; attempt: number }
  ) => void;
}

export interface UseWebRTCReturn {
  getOrCreatePeer: (id: string, initiator: boolean, forceTurn?: boolean) => Promise<RTCPeerConnection>;
  removePeer: (id: string) => void;
  peers: () => string[];
  closeAll: () => void;
  forceTurnReconnect: (id: string, initiator: boolean) => Promise<RTCPeerConnection | null>;
  safeAddRemoteCandidate: (peerId: string, candidate: RTCIceCandidateInit) => Promise<void>;
  createOfferForPeer: (
    peerId: string,
    stream: MediaStream | null,
    offerOptions?: RTCOfferOptions,
    trackKinds?: ('audio' | 'video')[]
  ) => Promise<RTCSessionDescriptionInit | null>;
  acceptOfferFromPeer: (
    peerId: string,
    sdp: RTCSessionDescriptionInit,
    stream: MediaStream | null,
    answerOptions?: RTCOfferOptions,
    trackKinds?: ('audio' | 'video')[]
  ) => Promise<RTCSessionDescriptionInit | null>;
  acceptAnswerFromPeer: (peerId: string, sdp: RTCSessionDescriptionInit) => Promise<boolean>;
  attachStreamTracks: (peerId: string, stream: MediaStream, trackKinds?: ('audio' | 'video')[]) => Promise<void>;
  hasPeer: (peerId: string) => boolean;
  peerIds: string[]; // local reactive list of peer ids
}

// Focused hook on peer connection lifecycle
export function useWebRTC(options: UseWebRTCOptions = {}): UseWebRTCReturn {
  const peersRef = useRef<Map<string, PeerMapEntry>>(new Map());
  const iceHandlerRef = useRef<UseWebRTCOptions['onIceCandidate']>(undefined);
  const stateHandlerRef = useRef<UseWebRTCOptions['onConnectionStateChange']>(undefined);
  const trackHandlerRef = useRef<UseWebRTCOptions['onTrack']>(undefined);
  const offerHandlerRef = useRef<UseWebRTCOptions['onOffer']>(undefined);
  const answerHandlerRef = useRef<UseWebRTCOptions['onAnswer']>(undefined);
  const debugEnabled = useRef<boolean>(false);
  const remoteCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  // Track applied remote answers to avoid duplicate setRemoteDescription calls
  const appliedRemoteAnswersRef = useRef<Set<string>>(new Set());
  // Reactive peer id list for consumers
  const [peerIds, setPeerIds] = useState<string[]>([]);
  // Track per-peer restart and fallback debounce
  const restartedRef = useRef<Set<string>>(new Set());
  const fallbackCooldownRef = useRef<Map<string, number>>(new Map());
  // Persist attempt counts across peer recreation so we can escalate to TURN-only (attempt 3)
  const attemptCountsRef = useRef<Map<string, number>>(new Map());
  // Track negotiation timeouts to auto-escalate if remoteDescription never arrives
  const negotiationTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Keep latest callbacks without re-binding existing peer listeners
  useEffect(() => {
    iceHandlerRef.current = options.onIceCandidate;
  }, [options.onIceCandidate]);
  useEffect(() => {
    stateHandlerRef.current = options.onConnectionStateChange;
  }, [options.onConnectionStateChange]);
  useEffect(() => {
    trackHandlerRef.current = options.onTrack;
  }, [options.onTrack]);
  useEffect(() => {
    offerHandlerRef.current = options.onOffer;
  }, [options.onOffer]);
  useEffect(() => {
    answerHandlerRef.current = options.onAnswer;
  }, [options.onAnswer]);
  useEffect(() => {
    try {
      const urlDebug = typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('webrtcDebug');
      debugEnabled.current =
        Boolean(urlDebug) || process.env.NEXT_PUBLIC_WEBRTC_DEBUG === '1' || process.env.NODE_ENV === 'development';
    } catch {}
  }, []);

  const removePeer = useCallback((id: string) => {
    const entry = peersRef.current.get(id);
    if (!entry) return;
    try {
      entry.pc.onicecandidate = null;
      entry.pc.ontrack = null;
      entry.pc.onconnectionstatechange = null;
      entry.pc.close();
    } catch {}
    peersRef.current.delete(id);
    setPeerIds(prev => prev.filter(p => p !== id));
    appliedRemoteAnswersRef.current.delete(id);
  }, []);

  const closeAll = useCallback(() => {
    for (const id of Array.from(peersRef.current.keys())) removePeer(id);
  }, [removePeer]);

  const getOrCreatePeer = useCallback(
    async (id: string, initiator: boolean, forceTurn: boolean = false) => {
      // If peer exists and we are not forcing a new TURN attempt, reuse
      const existing = peersRef.current.get(id);
      if (existing && !forceTurn) return existing.pc;

      const prevAttempt = attemptCountsRef.current.get(id) || 0;
      let nextAttempt = prevAttempt || 0;
      let useOptimizedStrategy = false;

      if (!prevAttempt) {
        nextAttempt = 1;
        useOptimizedStrategy = true;
      } else if (forceTurn) {
        // Escalate after failure
        nextAttempt = Math.min(prevAttempt + 1, 3);
      } else {
        nextAttempt = prevAttempt;
      }
      attemptCountsRef.current.set(id, nextAttempt);

      if (existing) removePeer(id);

      let cfg: RTCConfiguration;
      if (useOptimizedStrategy || nextAttempt >= 2) {
        cfg = await createRTCConfiguration(); // STUN + TURN hybrid approach
      } else if (nextAttempt === 1) {
        cfg = createStunOnlyRTCConfiguration(); // Fallback to STUN-only for retries
      } else {
        cfg = await createTurnOnlyRTCConfiguration(); // Force TURN-only as last resort
      }

      const usingTurn = useOptimizedStrategy || nextAttempt >= 2;
      const pc = new RTCPeerConnection(cfg);
      const entry: PeerMapEntry = {
        pc,
        isUsingTurn: usingTurn,
        connectionAttempt: nextAttempt,
        useOptimizedStrategy,
      };
      peersRef.current.set(id, entry);
      setPeerIds(prev => (prev.includes(id) ? prev : [...prev, id]));
      // Clear any stale queued candidates from prior attempts
      remoteCandidateQueueRef.current.delete(id);
      // Clear any prior negotiation timeout
      const prevT = negotiationTimeoutsRef.current.get(id);
      if (prevT) clearTimeout(prevT);
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__peers = (window as any).__peers || {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__peers[id] = pc;
      }
      if (debugEnabled.current) {
        console.log('[WEBRTC] createPeer', {
          peerId: id,
          attempt: nextAttempt,
          usingTurn,
          iceServers: cfg.iceServers?.map(s => s.urls) || [],
        });
      }

      // ICE candidate outbound handler
      pc.onicecandidate = ev => {
        if (ev.candidate && iceHandlerRef.current) {
          try {
            iceHandlerRef.current(id, ev.candidate);
          } catch {}
        }
      };

      // Queue remote candidates until remoteDescription is set
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pc as any)._applyQueuedCandidates = async () => {
        const queued = remoteCandidateQueueRef.current.get(id);
        if (!queued || !queued.length) return;
        if (debugEnabled.current)
          console.log('[WEBRTC] applying queued candidates', { peerId: id, count: queued.length });

        let applied = 0;
        for (const c of queued) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c));
            applied++;
          } catch (e) {
            if (debugEnabled.current) console.warn('[WEBRTC] queued candidate failed', e);
          }
        }

        if (debugEnabled.current && applied > 0) {
          console.log('[WEBRTC] successfully applied candidates', { peerId: id, applied, total: queued.length });
        }

        remoteCandidateQueueRef.current.delete(id);

        // If we successfully applied candidates, cancel any negotiation timeout
        const t = negotiationTimeoutsRef.current.get(id);
        if (t) {
          clearTimeout(t);
          negotiationTimeoutsRef.current.delete(id);
        }
      };

      // Set negotiation timeout for faster escalation in production
      if (nextAttempt < 3) {
        const timeout = setTimeout(
          () => {
            if (!pc.remoteDescription || pc.connectionState === 'failed') {
              if (debugEnabled.current)
                console.warn('[WEBRTC] negotiation timeout - escalating', { peerId: id, attempt: nextAttempt });
              forceTurnReconnect(id, initiator).catch(() => {});
            }
          },
          useOptimizedStrategy ? 5000 : nextAttempt === 1 ? 4000 : nextAttempt === 2 ? 3000 : 2000
        );
        negotiationTimeoutsRef.current.set(id, timeout);
      }

      pc.onconnectionstatechange = () => {
        if (debugEnabled.current) {
          console.log('[WEBRTC] connectionState', {
            peerId: id,
            state: pc.connectionState,
            attempt: entry.connectionAttempt,
            usingTurn: entry.isUsingTurn,
          });
        }
        if (stateHandlerRef.current) {
          try {
            stateHandlerRef.current(id, pc.connectionState, pc, {
              usingTurn: entry.isUsingTurn,
              attempt: entry.connectionAttempt,
            });
          } catch {}
        }
        if (pc.connectionState === 'connected') {
          // Clear any pending negotiation timeout on successful connection
          const t = negotiationTimeoutsRef.current.get(id);
          if (t) {
            clearTimeout(t);
            negotiationTimeoutsRef.current.delete(id);
          }
          // Reset restart tracking on successful connection
          restartedRef.current.delete(id);
        }
        if (pc.connectionState === 'failed') {
          const now = Date.now();
          const last = fallbackCooldownRef.current.get(id) || 0;
          if (now - last < 1000) return;
          fallbackCooldownRef.current.set(id, now);

          // Skip restartIce for optimized strategy - go straight to TURN
          if (!entry.useOptimizedStrategy && !restartedRef.current.has(id) && entry.connectionAttempt === 1) {
            try {
              if (debugEnabled.current) console.log('[WEBRTC] restartIce()', { peerId: id });
              restartedRef.current.add(id);
              pc.restartIce();
              setTimeout(() => {
                if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') {
                  forceTurnReconnect(id, true).catch(() => {});
                }
              }, 1000);
              return;
            } catch {}
          }
          if (entry.connectionAttempt < 3) {
            // Immediate escalation for optimized strategy
            const delay = entry.useOptimizedStrategy ? 100 : entry.connectionAttempt === 1 ? 200 : 300;
            setTimeout(() => forceTurnReconnect(id, true).catch(() => {}), delay);
          }
        }
      };

      pc.ontrack = ev => {
        if (debugEnabled.current) {
          console.log('[WEBRTC] ontrack', { peerId: id, streams: ev.streams.length });
        }
        if (trackHandlerRef.current) {
          try {
            trackHandlerRef.current(id, ev, pc, {
              usingTurn: entry.isUsingTurn,
              attempt: entry.connectionAttempt,
            });
          } catch {}
        }
      };
      pc.oniceconnectionstatechange = () => {
        if (debugEnabled.current) {
          console.log('[WEBRTC] iceConnectionState', { peerId: id, state: pc.iceConnectionState });
        }
      };

      return pc;
    },
    [removePeer]
  );

  const forceTurnReconnect = useCallback(
    async (id: string, initiator: boolean) => {
      return getOrCreatePeer(id, initiator, true);
    },
    [getOrCreatePeer]
  );

  const safeAddRemoteCandidate = useCallback(async (peerId: string, candidate: RTCIceCandidateInit) => {
    const entry = peersRef.current.get(peerId);
    if (!entry) return;
    const pc = entry.pc;
    if (!pc.remoteDescription || !pc.remoteDescription.type) {
      const q = remoteCandidateQueueRef.current.get(peerId) || [];
      q.push(candidate);
      remoteCandidateQueueRef.current.set(peerId, q);
      if (debugEnabled.current) console.log('[WEBRTC] queued candidate (remoteDescription not set)', { peerId });
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      if (debugEnabled.current) console.warn('[WEBRTC] addIceCandidate error', { peerId, e });
    }
  }, []);

  // Attach tracks (by kind filter) if missing; replace existing of same kind
  const attachStreamTracks = useCallback(
    async (peerId: string, stream: MediaStream, trackKinds: ('audio' | 'video')[] = ['audio', 'video']) => {
      const entry = peersRef.current.get(peerId);
      if (!entry) return;
      const pc = entry.pc;
      for (const kind of trackKinds) {
        const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
        if (!track) continue;
        const existing = pc.getSenders().find(s => s.track && s.track.kind === kind);
        if (!existing) {
          try {
            pc.addTrack(track, stream);
          } catch {}
        } else if (existing.track !== track) {
          try {
            existing.replaceTrack(track);
          } catch {}
        }
      }
    },
    []
  );

  const createOfferForPeer = useCallback(
    async (
      peerId: string,
      stream: MediaStream | null,
      offerOptions?: RTCOfferOptions,
      trackKinds: ('audio' | 'video')[] = ['audio', 'video']
    ) => {
      const pc = await getOrCreatePeer(peerId, true);
      if (stream) await attachStreamTracks(peerId, stream, trackKinds);
      try {
        const offer = await pc.createOffer(offerOptions);
        await pc.setLocalDescription(offer);
        offerHandlerRef.current?.(peerId, offer);
        return offer;
      } catch (e) {
        if (debugEnabled.current) console.warn('[WEBRTC] createOffer error', { peerId, e });
        return null;
      }
    },
    [getOrCreatePeer, attachStreamTracks]
  );

  const acceptOfferFromPeer = useCallback(
    async (
      peerId: string,
      sdp: RTCSessionDescriptionInit,
      stream: MediaStream | null,
      answerOptions?: RTCOfferOptions,
      trackKinds: ('audio' | 'video')[] = ['audio', 'video']
    ) => {
      const pc = await getOrCreatePeer(peerId, false);
      if (pc.signalingState !== 'stable') return null; // guard double offers
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        // Flush queued candidates
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (pc as any)._applyQueuedCandidates?.();
        if (stream) await attachStreamTracks(peerId, stream, trackKinds);
        const answer = await pc.createAnswer(answerOptions);
        await pc.setLocalDescription(answer);
        answerHandlerRef.current?.(peerId, answer);
        return answer;
      } catch (e) {
        if (debugEnabled.current) console.warn('[WEBRTC] acceptOffer error', { peerId, e });
        return null;
      }
    },
    [getOrCreatePeer, attachStreamTracks]
  );

  const acceptAnswerFromPeer = useCallback(async (peerId: string, sdp: RTCSessionDescriptionInit) => {
    if (appliedRemoteAnswersRef.current.has(peerId)) return false;
    const entry = peersRef.current.get(peerId);
    if (!entry) return false;
    const pc = entry.pc;
    if (pc.signalingState !== 'have-local-offer') return false;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      // Flush queued ICE
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (pc as any)._applyQueuedCandidates?.();
      appliedRemoteAnswersRef.current.add(peerId);
      return true;
    } catch (e) {
      if (debugEnabled.current) console.warn('[WEBRTC] acceptAnswer error', { peerId, e });
      return false;
    }
  }, []);

  const hasPeer = useCallback((peerId: string) => peersRef.current.has(peerId), []);

  return {
    getOrCreatePeer,
    removePeer,
    peers: () => Array.from(peersRef.current.keys()),
    closeAll,
    forceTurnReconnect,
    safeAddRemoteCandidate,
    createOfferForPeer,
    acceptOfferFromPeer,
    acceptAnswerFromPeer,
    attachStreamTracks,
    hasPeer,
    peerIds,
  };
}
