import { TURN_CREDENTIAL_CACHE_MS } from './constants';
import { logClient, logDebug } from '@/src/core/logger/client-logger';

const turnApiKey = process.env.NEXT_PUBLIC_METERED_API_KEY;
const TURN_API_URL = `https://whonoahexe.metered.live/api/v1/turn/credentials?apiKey=${turnApiKey}`;

// Cache TURN credentials to avoid repeated API calls
let turnCredentialsCache: { servers: RTCIceServer[]; timestamp: number } | null = null;
const TURN_CACHE_DURATION = TURN_CREDENTIAL_CACHE_MS;

// Pre-fetch TURN credentials in parallel to avoid blocking
let turnCredentialsFetch: Promise<RTCIceServer[] | null> | null = null;

// Pre-warm TURN credentials on module load for faster connections
if (typeof window !== 'undefined' && turnApiKey) {
  turnCredentialsFetch = fetchTurnCredentials();
}

const STUN_SERVERS: RTCIceServer[] = [
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun3.l.google.com:19302',
      'stun:stun4.l.google.com:19302',
    ],
  },
];

// Fetches TURN credentials from the Metered API with caching
export async function fetchTurnCredentials(): Promise<RTCIceServer[] | null> {
  if (!turnApiKey) {
    logClient({
      level: 'warn',
      domain: 'webrtc',
      event: 'config_missing',
      message: 'NEXT_PUBLIC_METERED_API_KEY not found in environment variables',
    });
    return null;
  }

  // Check cache first
  const now = Date.now();
  if (turnCredentialsCache && now - turnCredentialsCache.timestamp < TURN_CACHE_DURATION) {
    logDebug('webrtc', 'credentials_cached', 'Using cached credentials');
    return turnCredentialsCache.servers;
  }

  // If there's already a fetch in progress, wait for it
  if (turnCredentialsFetch) {
    try {
      const result = await turnCredentialsFetch;
      turnCredentialsFetch = null;
      return result;
    } catch {
      turnCredentialsFetch = null;
    }
  }

  try {
    const response = await fetch(TURN_API_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logClient({
        level: 'warn',
        domain: 'webrtc',
        event: 'fetch_failed',
        message: 'Failed to fetch TURN credentials',
        meta: { status: response.status, statusText: response.statusText },
      });
      return null;
    }

    const raw = await response.json();
    logDebug('webrtc', 'fetch_raw_response', 'Raw API Response', { raw });

    const candidate = Array.isArray(raw) ? raw : Array.isArray(raw?.iceServers) ? raw.iceServers : null;
    if (!candidate) {
      logClient({
        level: 'warn',
        domain: 'webrtc',
        event: 'invalid_payload',
        message: 'Unexpected credential payload format. Expected array or { iceServers: [...] }',
      });
      return null;
    }
    // Basic validation: ensure at least one TURN (relay) server present
    const hasTurn = candidate.some((s: RTCIceServer) =>
      Array.isArray(s.urls)
        ? (s.urls as string[]).some((u: string) => u.startsWith('turn:') || u.startsWith('turns:'))
        : typeof s.urls === 'string' && (s.urls.startsWith('turn:') || s.urls.startsWith('turns:'))
    );
    if (!hasTurn) {
      logClient({
        level: 'warn',
        domain: 'webrtc',
        event: 'no_relay_urls',
        message: 'No TURN relay URLs found in response. Will still return servers for STUN usage.',
      });
    }

    const servers = candidate as RTCIceServer[];
    turnCredentialsCache = { servers, timestamp: now };

    return servers;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TimeoutError') {
        logClient({
          level: 'warn',
          domain: 'webrtc',
          event: 'fetch_timeout',
          message: 'Request timeout when fetching TURN credentials',
        });
      } else {
        logClient({
          level: 'warn',
          domain: 'webrtc',
          event: 'fetch_error',
          message: 'Error fetching TURN credentials',
          meta: { error: error.message },
        });
      }
    } else {
      logClient({
        level: 'warn',
        domain: 'webrtc',
        event: 'fetch_error_unknown',
        message: 'Unknown error fetching TURN credentials',
        meta: { error },
      });
    }
    return null;
  }
}

// Creates ICE server configuration with STUN-first, TURN-fallback strategy
export async function createIceServerConfig(): Promise<RTCIceServer[]> {
  // Always include STUN servers first for optimal performance
  const iceServers: RTCIceServer[] = [...STUN_SERVERS];

  // Try to add TURN servers as fallback
  try {
    const turnServers = await fetchTurnCredentials();

    if (turnServers && turnServers.length > 0) {
      iceServers.push(...turnServers);
      logClient({
        level: 'info',
        domain: 'webrtc',
        event: 'turn_configured',
        message: 'Successfully configured TURN servers as fallback',
      });
    } else {
      logClient({
        level: 'info',
        domain: 'webrtc',
        event: 'turn_unavailable',
        message: 'No TURN credentials available, using STUN-only configuration',
      });
    }
  } catch (error) {
    logClient({
      level: 'warn',
      domain: 'webrtc',
      event: 'config_failed',
      message: 'Failed to configure TURN servers, falling back to STUN-only',
      meta: { error },
    });
  }

  return iceServers;
}

// Gets STUN-only configuration for initial connection attempts
export function getStunOnlyConfig(): RTCIceServer[] {
  return [...STUN_SERVERS];
}

// Creates RTCConfiguration with ICE servers and optimal settings for production
export async function createRTCConfiguration(): Promise<RTCConfiguration> {
  const iceServers = await createIceServerConfig();

  return {
    iceServers,
    iceTransportPolicy: 'all', // Allow both STUN and TURN
    iceCandidatePoolSize: 4,
    bundlePolicy: 'max-bundle', // Bundle all media on a single connection
    rtcpMuxPolicy: 'require',
  };
}

export async function createTurnOnlyRTCConfiguration(): Promise<RTCConfiguration> {
  const turnServers = await fetchTurnCredentials();
  if (!turnServers || turnServers.length === 0) {
    logClient({
      level: 'warn',
      domain: 'webrtc',
      event: 'turn_only_failed',
      message: 'No TURN servers available for turn-only configuration. Falling back to STUN config.',
    });
    return createRTCConfiguration();
  }
  return {
    iceServers: turnServers,
    iceTransportPolicy: 'relay', // Force relay only for reliability
    iceCandidatePoolSize: 0,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };
}

// Creates RTCConfiguration with STUN-only for initial connection attempts
export function createStunOnlyRTCConfiguration(): RTCConfiguration {
  return {
    iceServers: getStunOnlyConfig(),
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: 2,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
  };
}
