// Media Caps & Timeouts

/** Maximum participants allowed in voice chat */
export const VOICE_MAX_PARTICIPANTS = 5;
/** Maximum participants allowed in video chat */
export const VIDEO_CHAT_MAX_PARTICIPANTS = 5;
/** Auto-disconnect timeout when alone in media chat (2 minutes) */
export const SOLO_USER_TIMEOUT_MS = 120_000;

// WebRTC

/** Timeout for WebRTC peer connection establishment */
export const WEBRTC_CONNECTION_TIMEOUT_MS = 15_000;
/** Maximum fallback attempts before giving up on a peer connection */
export const WEBRTC_MAX_FALLBACK_ATTEMPTS = 3;
/** How long to cache TURN credentials (5 minutes) */
export const TURN_CREDENTIAL_CACHE_MS = 5 * 60 * 1000;

// Video Sync

/** Debounce window for play/pause system messages */
export const VIDEO_SYNC_DEBOUNCE_MS = 1_000;
/** Debounce window for video error reports from clients */
export const VIDEO_ERROR_REPORT_DEBOUNCE_MS = 8_000;

// Audio Analysis

/** Average frequency threshold for speaking detection */
export const SPEAKING_DETECTION_THRESHOLD = 20;
/** FFT size for audio analyser nodes */
export const ANALYSER_FFT_SIZE = 512;
