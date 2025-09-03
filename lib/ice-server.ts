const turnApiKey = process.env.NEXT_PUBLIC_METERED_API_KEY;
const TURN_API_URL = `https://whonoahexe.metered.live/api/v1/turn/credentials?apiKey=${turnApiKey}`;

// Cache TURN credentials for 5 minutes to avoid repeated API calls
let turnCredentialsCache: { servers: RTCIceServer[]; timestamp: number } | null = null;
const TURN_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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
    console.warn('[TURN] NEXT_PUBLIC_METERED_API_KEY not found in environment variables');
    return null;
  }

  // Check cache first
  const now = Date.now();
  if (turnCredentialsCache && now - turnCredentialsCache.timestamp < TURN_CACHE_DURATION) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[TURN] Using cached credentials');
    }
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
      console.warn('[TURN] Failed to fetch TURN credentials:', response.status, response.statusText);
      return null;
    }

    const raw = await response.json();
    console.log('[TURN] Raw API Response:', raw);

    const candidate = Array.isArray(raw) ? raw : Array.isArray(raw?.iceServers) ? raw.iceServers : null;
    if (!candidate) {
      console.warn('[TURN] Unexpected credential payload format. Expected array or { iceServers: [...] }');
      return null;
    }
    // Basic validation: ensure at least one TURN (relay) server present
    const hasTurn = candidate.some((s: RTCIceServer) =>
      Array.isArray(s.urls)
        ? (s.urls as string[]).some((u: string) => u.startsWith('turn:') || u.startsWith('turns:'))
        : typeof s.urls === 'string' && (s.urls.startsWith('turn:') || s.urls.startsWith('turns:'))
    );
    if (!hasTurn) {
      console.warn('[TURN] No TURN relay URLs found in response. Will still return servers for STUN usage.');
    }

    const servers = candidate as RTCIceServer[];
    turnCredentialsCache = { servers, timestamp: now };

    return servers;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TimeoutError') {
        console.warn('[TURN] Request timeout when fetching TURN credentials');
      } else {
        console.warn('[TURN] Error fetching TURN credentials:', error.message);
      }
    } else {
      console.warn('[TURN] Unknown error fetching TURN credentials:', error);
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
      console.log('[TURN] Successfully configured TURN servers as fallback');
    } else {
      console.log('[TURN] No TURN credentials available, using STUN-only configuration');
    }
  } catch (error) {
    console.warn('[TURN] Failed to configure TURN servers, falling back to STUN-only:', error);
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
    console.warn('[TURN] No TURN servers available for turn-only configuration. Falling back to STUN config.');
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
