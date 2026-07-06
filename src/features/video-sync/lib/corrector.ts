// Pure dual-band drift corrector. No React, no DOM — node-testable.
import {
  SYNC_DEAD_BAND_S,
  SYNC_SOFT_BAND_S,
  SYNC_NUDGE_GAIN,
  SYNC_MAX_NUDGE,
  YOUTUBE_SEEK_TOLERANCE_S,
} from '@/src/lib/constants';

/** 'rate' = HTML5/HLS (fine playbackRate control); 'seek' = YouTube/Cast (discrete rates only). */
export type CorrectorMode = 'rate' | 'seek';

export interface DecideCorrectionParams {
  /** projected - playerCurrentTime. Positive = player is behind and must speed up. */
  drift: number;
  mode: CorrectorMode;
  /** Whether the player's playbackRate is currently nudged away from 1.0. */
  rateNudged: boolean;
  /** Whether SYNC_COOLDOWN_MS has elapsed since the last hard seek. */
  cooldownElapsed: boolean;
}

export type CorrectionResult =
  | { action: 'none'; resetRate: boolean }
  | { action: 'nudge'; rate: number }
  | { action: 'seek' };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Decide how to correct drift for the current player mode.
 * - mode 'seek' (YouTube/Cast): dead-band below YOUTUBE_SEEK_TOLERANCE_S -> none; above -> seek if
 *   cooldownElapsed else none. Never returns 'nudge' (discrete playbackRate steps only).
 * - mode 'rate' (HTML5/HLS): |drift| < SYNC_DEAD_BAND_S -> none (resetRate if previously nudged);
 *   <= SYNC_SOFT_BAND_S -> nudge with clamped rate; > SYNC_SOFT_BAND_S -> seek if cooldownElapsed
 *   else none.
 */
export function decideCorrection(params: DecideCorrectionParams): CorrectionResult {
  const { drift, mode, rateNudged, cooldownElapsed } = params;
  const absDrift = Math.abs(drift);

  if (mode === 'seek') {
    if (absDrift < YOUTUBE_SEEK_TOLERANCE_S) {
      return { action: 'none', resetRate: rateNudged };
    }
    return cooldownElapsed ? { action: 'seek' } : { action: 'none', resetRate: rateNudged };
  }

  // mode === 'rate'
  if (absDrift < SYNC_DEAD_BAND_S) {
    return { action: 'none', resetRate: rateNudged };
  }

  if (absDrift <= SYNC_SOFT_BAND_S) {
    const rate = clamp(1 + SYNC_NUDGE_GAIN * drift, 1 - SYNC_MAX_NUDGE, 1 + SYNC_MAX_NUDGE);
    return { action: 'nudge', rate };
  }

  return cooldownElapsed ? { action: 'seek' } : { action: 'none', resetRate: rateNudged };
}

/**
 * Timestamp-monotonicity guard: drop any authoritative sync-update whose anchor timestamp
 * predates the client's own last locally-issued intent. This is what prevents the host from being
 * yanked immediately after its own seek.
 */
export function shouldApplySyncUpdate(anchorTimestamp: number, lastIntentTimestamp: number): boolean {
  return anchorTimestamp >= lastIntentTimestamp;
}
