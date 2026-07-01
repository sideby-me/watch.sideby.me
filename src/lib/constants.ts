// Media Caps & Timeouts

/** Auto-disconnect timeout when alone in media chat (2 minutes) */
export const SOLO_USER_TIMEOUT_MS = 120_000;

// WebRTC

/** Timeout for WebRTC peer connection establishment */
export const WEBRTC_CONNECTION_TIMEOUT_MS = 15_000;
/** Maximum fallback attempts before giving up on a peer connection */
export const WEBRTC_MAX_FALLBACK_ATTEMPTS = 3;

// Video Sync

/** Debounce window for play/pause system messages */
export const VIDEO_SYNC_DEBOUNCE_MS = 1_000;
/** Debounce window for video error reports from clients */
export const VIDEO_ERROR_REPORT_DEBOUNCE_MS = 8_000;
/** Maximum drift (seconds) before a forced seek correction (legacy; superseded by dual-band corrector) */
export const SYNC_TOLERANCE_S = 0.4;
/** Minimum interval (ms) between forced seek corrections to prevent thrashing */
export const SYNC_COOLDOWN_MS = 3_000;
/** Slow host->server re-anchor cadence (mirrors sync.sideby.me) */
export const HOST_REANCHOR_MS = 10_000;
/** Below this drift (seconds), do nothing (avoids thrashing on measurement jitter) */
export const SYNC_DEAD_BAND_S = 0.15;
/** Between dead-band and this drift (seconds), glide via playbackRate nudge */
export const SYNC_SOFT_BAND_S = 1.0;
/** Proportional gain for the playbackRate nudge */
export const SYNC_NUDGE_GAIN = 0.5;
/** Clamp playbackRate to 1 +/- this amount (HTML5/HLS glide) */
export const SYNC_MAX_NUDGE = 0.05;
/** Client local projection corrector loop interval */
export const SYNC_CORRECTOR_INTERVAL_MS = 400;
/** Raised hard-seek threshold (seconds) for YouTube/Cast (discrete playbackRate only) */
export const YOUTUBE_SEEK_TOLERANCE_S = 0.75;
