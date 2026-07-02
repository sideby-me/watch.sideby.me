// Pure HLS error-recovery policy (fixes the intermittent "Playback hit a snag" defect).
// No hls.js import, no DOM, no Date.now() inside — `now` is always caller-injected so this
// module stays deterministic and node-testable (mirrors src/features/video-sync/lib/corrector.ts).

/** Rolling window (ms) used to decay transient network-error counts so blips spread across a
 * long session never accumulate into a terminal decision. */
export const NETWORK_ERROR_WINDOW_MS = 15000;

/** Max networkish errors (fatal or not) allowed inside the rolling window before treating a
 * burst of transient errors as a real, terminal problem. */
export const MAX_NETWORK_ERRORS_IN_WINDOW = 3;

/** Max bounded hls.startLoad() reload attempts for fatal network errors before giving up. */
export const MAX_NETWORK_RELOADS = 2;

/** Max hls.recoverMediaError() attempts before falling back to detach+reattach (preserved). */
export const MAX_MEDIA_ERROR_RECOVERIES = 2;

const CODEC_UNPARSABLE_TOKENS = ['fragParsingError', 'manifestParsingError', 'levelParsingError', 'demux', 'parse'];

export interface HlsRecoveryState {
  networkErrorTimestamps: number[];
  mediaRecoveryCount: number;
  networkReloadCount: number;
  reattachAttempted: boolean;
}

/** Fresh, mutable recovery state — create one per <video> src (reset on src change). */
export function createHlsRecoveryState(): HlsRecoveryState {
  return {
    networkErrorTimestamps: [],
    mediaRecoveryCount: 0,
    networkReloadCount: 0,
    reattachAttempted: false,
  };
}

export interface HlsErrorInput {
  type?: string;
  details?: string;
  fatal?: boolean;
  responseCode?: number;
}

export type HlsRecoveryAction = 'ignore' | 'recover-media' | 'reload-network' | 'reattach' | 'terminal';

export interface HlsRecoveryDecision {
  action: HlsRecoveryAction;
  codecUnparsable: boolean;
}

export interface DecideHlsRecoveryInput {
  error: HlsErrorInput;
  state: HlsRecoveryState;
  /** Injected timestamp (ms) — never Date.now() internally, for deterministic tests. */
  now: number;
}

/** Codec-unparsable classification, split out so it can be asserted independently. */
export function classifyHlsError(details?: string): { codecUnparsable: boolean } {
  const codecUnparsable = Boolean(
    details && CODEC_UNPARSABLE_TOKENS.some(token => details.toLowerCase().includes(token.toLowerCase()))
  );
  return { codecUnparsable };
}

function isNetworkish(error: HlsErrorInput): boolean {
  return error.type === 'networkError' || error.details === 'fragLoadError' || error.details === 'manifestLoadError';
}

/**
 * Decide how hls-player.tsx should react to a single hls.js ERROR event.
 *
 * Preserves every pre-existing terminal path (hard HTTP >=400, bufferAddCodecError, media
 * recover->reattach exhaustion) while fixing the defect where a cumulative, never-decaying
 * network-error counter turned two independently-recovered transient blips into a false
 * terminal error for one client.
 */
export function decideHlsRecovery(input: DecideHlsRecoveryInput): HlsRecoveryDecision {
  const { error, state, now } = input;
  const { codecUnparsable } = classifyHlsError(error.details);

  // Non-fatal buffer stall: hls.js's own ABR/buffer manager handles this; never surface.
  if (error.details === 'bufferStalledError' && error.fatal === false) {
    return { action: 'ignore', codecUnparsable };
  }

  // Unsupported codec: addSourceBuffer() threw — unrecoverable, skip straight to terminal.
  if (error.details === 'bufferAddCodecError') {
    return { action: 'terminal', codecUnparsable };
  }

  const networkish = isNetworkish(error);

  if (networkish) {
    // Hard HTTP block (403/404/410/...) is never recoverable — terminal immediately.
    if (error.responseCode !== undefined && error.responseCode >= 400) {
      return { action: 'terminal', codecUnparsable };
    }

    // Prune stale timestamps outside the rolling window before counting this occurrence —
    // this is the fix: blips spread across a session (outside the window) never accumulate.
    state.networkErrorTimestamps = state.networkErrorTimestamps.filter(ts => now - ts <= NETWORK_ERROR_WINDOW_MS);
    state.networkErrorTimestamps.push(now);

    if (!error.fatal) {
      // hls.js auto-retries non-fatal fragment/manifest load errors on its own. Only a burst
      // of them inside the window indicates a real, sustained problem.
      if (state.networkErrorTimestamps.length > MAX_NETWORK_ERRORS_IN_WINDOW) {
        return { action: 'terminal', codecUnparsable };
      }
      return { action: 'ignore', codecUnparsable };
    }

    // Fatal network error: attempt a bounded startLoad() reload before giving up.
    if (state.networkReloadCount >= MAX_NETWORK_RELOADS) {
      return { action: 'terminal', codecUnparsable };
    }
    state.networkReloadCount += 1;
    return { action: 'reload-network', codecUnparsable };
  }

  // Fatal media error: recover -> reattach -> terminal chain (preserved from prior behavior).
  if (error.type === 'mediaError' && error.fatal) {
    if (state.mediaRecoveryCount < MAX_MEDIA_ERROR_RECOVERIES) {
      state.mediaRecoveryCount += 1;
      return { action: 'recover-media', codecUnparsable };
    }
    if (!state.reattachAttempted) {
      state.reattachAttempted = true;
      return { action: 'reattach', codecUnparsable };
    }
    return { action: 'terminal', codecUnparsable };
  }

  // Any other fatal error surfaces as terminal; non-fatal, non-networkish errors are ignored.
  if (error.fatal) {
    return { action: 'terminal', codecUnparsable };
  }

  return { action: 'ignore', codecUnparsable };
}
