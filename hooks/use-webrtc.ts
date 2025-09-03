'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  createStunOnlyRTCConfiguration,
  createRTCConfiguration,
  createTurnOnlyRTCConfiguration,
} from '@/lib/ice-server';

export interface PeerMapEntry {
  pc: RTCPeerConnection;
  isUsingTurn: boolean;
  connectionAttempt: number;
}

export interface UseWebRTCOptions {
  // Fired when a local ICE candidate is gathered
  onIceCandidate?: (peerId: string, candidate: RTCIceCandidate) => void;
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
}

// Focused hook on peer connection lifecycle
export function useWebRTC(options: UseWebRTCOptions = {}): UseWebRTCReturn {
  const peersRef = useRef<Map<string, PeerMapEntry>>(new Map());
  const iceHandlerRef = useRef<UseWebRTCOptions['onIceCandidate']>(undefined);
  const stateHandlerRef = useRef<UseWebRTCOptions['onConnectionStateChange']>(undefined);
  const trackHandlerRef = useRef<UseWebRTCOptions['onTrack']>(undefined);
  const debugEnabled = useRef<boolean>(false);
  const remoteCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  // Track per-peer restart + fallback debounce
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
  }, []);

  const closeAll = useCallback(() => {
    for (const id of Array.from(peersRef.current.keys())) removePeer(id);
  }, [removePeer]);

  const getOrCreatePeer = useCallback(
    async (id: string, initiator: boolean, forceTurn: boolean = false) => {
      // If peer exists and we are not forcing a new TURN attempt, reuse
      const existing = peersRef.current.get(id);
      if (existing && !forceTurn) return existing.pc;

      // Determine next attempt number
      const prevAttempt = attemptCountsRef.current.get(id) || 0;
      let nextAttempt = prevAttempt || 0;
      if (!prevAttempt) {
        // brand new
        nextAttempt = forceTurn ? 2 : 1;
      } else if (forceTurn) {
        // escalate (cap at 3)
        nextAttempt = Math.min(prevAttempt + 1, 3);
      } else {
        // reuse path shouldn't reach here because existing would have returned
        nextAttempt = prevAttempt;
      }
      attemptCountsRef.current.set(id, nextAttempt);

      if (existing) removePeer(id);

      // Build configuration based on attempt
      let cfg: RTCConfiguration;
      if (nextAttempt === 1) {
        cfg = createStunOnlyRTCConfiguration();
      } else if (nextAttempt === 2) {
        cfg = await createRTCConfiguration(); // STUN + TURN
      } else {
        cfg = await createTurnOnlyRTCConfiguration(); // Relay-only hard fallback
      }
      const usingTurn = nextAttempt >= 2;
      const pc = new RTCPeerConnection(cfg);
      const entry: PeerMapEntry = { pc, isUsingTurn: usingTurn, connectionAttempt: nextAttempt };
      peersRef.current.set(id, entry);
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

      // Set negotiation timeout for all attempts to ensure connections don't hang
      if (nextAttempt < 3) {
        const timeout = setTimeout(
          () => {
            if (!pc.remoteDescription || pc.connectionState === 'failed') {
              if (debugEnabled.current)
                console.warn('[WEBRTC] negotiation timeout - escalating', { peerId: id, attempt: nextAttempt });
              forceTurnReconnect(id, initiator).catch(() => {});
            }
          },
          nextAttempt === 1 ? 10000 : nextAttempt === 2 ? 8000 : 6000
        ); // Progressive timeout reduction
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
          if (now - last < 2000) return; // Increased debounce
          fallbackCooldownRef.current.set(id, now);
          // Single restartIce try only on first attempt
          if (!restartedRef.current.has(id) && entry.connectionAttempt === 1) {
            try {
              if (debugEnabled.current) console.log('[WEBRTC] restartIce()', { peerId: id });
              restartedRef.current.add(id);
              pc.restartIce();
              setTimeout(() => {
                if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') {
                  forceTurnReconnect(id, true).catch(() => {});
                }
              }, 2000); // Increased restart wait time
              return;
            } catch {}
          }
          if (entry.connectionAttempt < 3) {
            setTimeout(() => forceTurnReconnect(id, true).catch(() => {}), entry.connectionAttempt === 1 ? 500 : 750);
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

  // Helper for higher layers to safely add a remote ICE candidate
  // (Wrap existing onIceCandidate logic; they call addIceCandidate directly now.)
  // We expose as side effect: if remoteDescription not yet set, queue.
  // Consumers (hooks) simply keep current flow; we intercept by monkey patching their pc via queue.
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

  // Monkey patch: consumer hooks call getOrCreatePeer then set remoteDescription; after that they can invoke _applyQueuedCandidates
  // We can't modify hooks easily here; but we can encourage adding:
  // (pc as any)._applyQueuedCandidates && (pc as any)._applyQueuedCandidates(); after setRemoteDescription in upper layers later.

  return {
    getOrCreatePeer,
    removePeer,
    peers: () => Array.from(peersRef.current.keys()),
    closeAll,
    forceTurnReconnect,
    safeAddRemoteCandidate,
  };
}
