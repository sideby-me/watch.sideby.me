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

/** HTMLMediaElement.readyState — below HAVE_FUTURE_DATA the element cannot advance currentTime. */
export const MEDIA_HAVE_FUTURE_DATA = 3;

export interface ReanchorGateInput {
  /** Whether the host's player reports it is not paused. */
  isPlaying: boolean;
  /** Player explicitly reports a stall (e.g. the YouTube BUFFERING state). */
  isBuffering?: boolean;
  /** HTMLMediaElement.readyState, when the active player exposes a video element. */
  readyState?: number;
}

/**
 * Stalled-host guard for the periodic host re-anchor.
 *
 * `HTMLMediaElement.paused` stays FALSE while a video rebuffers — it only flips on an explicit
 * pause() or at end of media. So a rebuffering host reports `isPlaying: true` with a frozen
 * currentTime, and re-anchoring that to the server overwrites the authoritative timeline with a
 * stalled one. The server then rebroadcasts it to the room and every healthy viewer, seeing a
 * large negative drift, hard-seeks BACKWARD to the stalled host's position — turning one
 * person's rebuffer into a room-wide rewind, repeated every re-anchor until the host recovers.
 *
 * A stalled host is therefore not an authoritative position and must not re-anchor. A *paused*
 * host still is: its currentTime is stable and meaningful.
 */
export function shouldEmitReanchor(input: ReanchorGateInput): boolean {
  const { isPlaying, isBuffering, readyState } = input;

  // A paused host is a stable, legitimate anchor.
  if (!isPlaying) return true;

  if (isBuffering) return false;

  // Below HAVE_FUTURE_DATA the element has no data to play past the current frame — it is
  // stalled, so its currentTime is frozen and must not be published as authoritative.
  if (readyState !== undefined && readyState < MEDIA_HAVE_FUTURE_DATA) return false;

  return true;
}
