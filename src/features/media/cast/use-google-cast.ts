'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { logCast, logClient } from '@/src/core/logger';

// Default Media Receiver Application ID
const DEFAULT_RECEIVER_APP_ID = 'CC1AD845';

export type CastConnectionState = 'unavailable' | 'idle' | 'connecting' | 'connected';

export interface CastPlayerRef {
  play: () => void;
  pause: () => void;
  seekTo: (time: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  isPaused: () => boolean;
}

export interface UseGoogleCastOptions {
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
  onError?: (error: Error) => void;
}

export interface UseGoogleCastReturn {
  connectionState: CastConnectionState;
  deviceName: string;
  isCasting: boolean;
  isAvailable: boolean;
  castPlayerRef: React.RefObject<CastPlayerRef | null>;
  startCasting: (mediaUrl: string, contentType?: string) => Promise<void>;
  stopCasting: () => void;
  requestSession: () => Promise<void>;
}

// Track SDK loading state globally to avoid duplicate script loads
let sdkLoadPromise: Promise<boolean> | null = null;
let sdkLoaded = false;

function loadCastSdk(): Promise<boolean> {
  if (sdkLoaded) return Promise.resolve(true);
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<boolean>(resolve => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    if (window.cast?.framework?.CastContext) {
      sdkLoaded = true;
      resolve(true);
      return;
    }

    // Set up the callback that the Cast SDK calls when ready
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      sdkLoaded = isAvailable;
      resolve(isAvailable);
    };

    // Check if script is already in DOM
    const existingScript = document.querySelector('script[src*="cast_sender.js"]');
    if (existingScript) {
      return;
    }

    // Load the Cast SDK
    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    script.async = true;
    script.onerror = () => {
      logClient({ level: 'warn', domain: 'cast', event: 'sdk_load_fail', message: 'Failed to load Google Cast SDK' });
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

export function useGoogleCast(options: UseGoogleCastOptions = {}): UseGoogleCastReturn {
  const { onSessionStart, onSessionEnd, onError } = options;

  const [connectionState, setConnectionState] = useState<CastConnectionState>('unavailable');
  const [deviceName, setDeviceName] = useState('');
  const [isAvailable, setIsAvailable] = useState(false);

  const remotePlayerRef = useRef<cast.framework.RemotePlayer | null>(null);
  const remotePlayerControllerRef = useRef<cast.framework.RemotePlayerController | null>(null);
  const castContextRef = useRef<cast.framework.CastContext | null>(null);

  const castPlayerRefInternal = useRef<CastPlayerRef | null>(null);
  const castPlayerRef = useRef<CastPlayerRef | null>(null);

  // Initialize Cast SDK and context
  useEffect(() => {
    let mounted = true;

    const initializeCast = async () => {
      const available = await loadCastSdk();

      if (!mounted) return;

      if (!available || typeof window === 'undefined' || !window.cast?.framework) {
        setIsAvailable(false);
        setConnectionState('unavailable');
        return;
      }

      setIsAvailable(true);

      try {
        const context = cast.framework.CastContext.getInstance();
        castContextRef.current = context;

        context.setOptions({
          receiverApplicationId: DEFAULT_RECEIVER_APP_ID,
          autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
          resumeSavedSession: true,
        });

        // Create RemotePlayer and controller
        const player = new cast.framework.RemotePlayer();
        const controller = new cast.framework.RemotePlayerController(player);

        remotePlayerRef.current = player;
        remotePlayerControllerRef.current = controller;

        // Create the player ref interface
        const playerInterface: CastPlayerRef = {
          play: () => {
            if (remotePlayerRef.current?.isPaused && remotePlayerControllerRef.current) {
              remotePlayerControllerRef.current.playOrPause();
            }
          },
          pause: () => {
            if (remotePlayerRef.current && !remotePlayerRef.current.isPaused && remotePlayerControllerRef.current) {
              remotePlayerControllerRef.current.playOrPause();
            }
          },
          seekTo: (time: number) => {
            if (remotePlayerRef.current && remotePlayerControllerRef.current) {
              remotePlayerRef.current.currentTime = time;
              remotePlayerControllerRef.current.seek();
            }
          },
          getCurrentTime: () => {
            return remotePlayerRef.current?.currentTime ?? 0;
          },
          getDuration: () => {
            return remotePlayerRef.current?.duration ?? 0;
          },
          isPaused: () => {
            return remotePlayerRef.current?.isPaused ?? true;
          },
        };

        castPlayerRefInternal.current = playerInterface;
        castPlayerRef.current = playerInterface;

        // Listen for cast state changes
        const handleCastStateChanged = (event: cast.framework.CastStateEventData) => {
          if (!mounted) return;

          switch (event.castState) {
            case cast.framework.CastState.NO_DEVICES_AVAILABLE:
              setConnectionState('idle');
              setDeviceName('');
              break;
            case cast.framework.CastState.NOT_CONNECTED:
              setConnectionState('idle');
              setDeviceName('');
              break;
            case cast.framework.CastState.CONNECTING:
              setConnectionState('connecting');
              break;
            case cast.framework.CastState.CONNECTED:
              setConnectionState('connected');
              const session = context.getCurrentSession();
              if (session) {
                setDeviceName(session.getCastDevice().friendlyName);
                onSessionStart?.();
              }
              break;
          }
        };

        // Listen for session state changes
        const handleSessionStateChanged = (event: cast.framework.CastStateEventData) => {
          if (!mounted) return;

          if (event.sessionState === cast.framework.SessionState.SESSION_ENDED) {
            setConnectionState('idle');
            setDeviceName('');
            onSessionEnd?.();
          }
        };

        context.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, handleCastStateChanged);
        context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, handleSessionStateChanged);

        // Check initial state
        const initialState = context.getCastState();
        if (initialState === cast.framework.CastState.CONNECTED) {
          setConnectionState('connected');
          const session = context.getCurrentSession();
          if (session) {
            setDeviceName(session.getCastDevice().friendlyName);
          }
        } else if (initialState === cast.framework.CastState.NO_DEVICES_AVAILABLE) {
          setConnectionState('idle');
        } else {
          setConnectionState('idle');
        }

        return () => {
          context.removeEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, handleCastStateChanged);
          context.removeEventListener(
            cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
            handleSessionStateChanged
          );
        };
      } catch (err) {
        logClient({
          level: 'error',
          domain: 'cast',
          event: 'init_fail',
          message: 'Failed to initialize Cast',
          meta: { error: String(err) },
        });
        setIsAvailable(false);
        setConnectionState('unavailable');
      }
    };

    initializeCast();

    return () => {
      mounted = false;
    };
  }, [onSessionStart, onSessionEnd]);

  // Request a new cast session
  const requestSession = useCallback(async () => {
    if (!castContextRef.current) {
      logClient({ level: 'warn', domain: 'cast', event: 'ctx_missing', message: 'Cast context not initialized' });
      return;
    }

    try {
      setConnectionState('connecting');
      await castContextRef.current.requestSession();
    } catch (err) {
      logClient({
        level: 'error',
        domain: 'cast',
        event: 'session_request_fail',
        message: 'Failed to request cast session',
        meta: { error: String(err) },
      });
      setConnectionState('idle');
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [onError]);

  // Start casting a specific media URL
  const startCasting = useCallback(
    async (mediaUrl: string, contentType?: string) => {
      logCast('start_casting', 'startCasting called', { mediaUrl, contentType });

      const context = castContextRef.current;
      if (!context) {
        logClient({ level: 'warn', domain: 'cast', event: 'ctx_missing', message: 'Cast context not initialized' });
        return;
      }

      // If not connected, request a session first
      const castState = context.getCastState();
      logCast('cast_state', 'Current cast state', { castState });

      if (castState !== cast.framework.CastState.CONNECTED) {
        logCast('request_session', 'Not connected, requesting session...');
        await requestSession();
      }

      const session = context.getCurrentSession();
      if (!session) {
        logClient({
          level: 'warn',
          domain: 'cast',
          event: 'session_fail',
          message: 'No active cast session after request',
        });
        return;
      }

      logCast('session_active', 'Got session, device: ' + session.getCastDevice().friendlyName);

      try {
        // Determine content type
        let effectiveContentType = contentType;
        if (!effectiveContentType) {
          if (mediaUrl.includes('.m3u8') || mediaUrl.includes('m3u8')) {
            effectiveContentType = 'application/x-mpegurl';
          } else if (mediaUrl.includes('.mp4')) {
            effectiveContentType = 'video/mp4';
          } else if (mediaUrl.includes('.webm')) {
            effectiveContentType = 'video/webm';
          } else {
            effectiveContentType = 'video/mp4'; // Default
          }
        }

        logCast('load_media', 'Loading media', { url: mediaUrl, contentType: effectiveContentType });

        const mediaInfo = new chrome.cast.media.MediaInfo(mediaUrl, effectiveContentType);
        mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;

        const request = new chrome.cast.media.LoadRequest(mediaInfo);
        request.autoplay = true;
        request.currentTime = 0;

        await session.loadMedia(request);
        logCast('load_success', 'Media loaded on Chromecast successfully');
      } catch (err) {
        logClient({
          level: 'error',
          domain: 'cast',
          event: 'load_fail',
          message: 'Failed to load media on Chromecast',
          meta: { error: String(err) },
        });
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [requestSession, onError]
  );

  // Stop the current cast session
  const stopCasting = useCallback(() => {
    if (castContextRef.current) {
      castContextRef.current.endCurrentSession(true);
      setConnectionState('idle');
      setDeviceName('');
    }
  }, []);

  return {
    connectionState,
    deviceName,
    isCasting: connectionState === 'connected',
    isAvailable,
    castPlayerRef,
    startCasting,
    stopCasting,
    requestSession,
  };
}
