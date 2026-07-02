import { describe, it, expect } from 'vitest';
import { decideCorrection, shouldApplySyncUpdate } from '@/src/features/video-sync/lib/corrector';
import { SYNC_DEAD_BAND_S, SYNC_SOFT_BAND_S, SYNC_MAX_NUDGE, YOUTUBE_SEEK_TOLERANCE_S } from '@/src/lib/constants';

describe('decideCorrection — mode: rate (HTML5/HLS)', () => {
  it('returns none within the dead-band', () => {
    const result = decideCorrection({ drift: 0.05, mode: 'rate', rateNudged: false, cooldownElapsed: true });
    expect(result).toEqual({ action: 'none', resetRate: false });
  });

  it('returns none with resetRate=true when previously nudged and now inside dead-band', () => {
    const result = decideCorrection({ drift: 0.01, mode: 'rate', rateNudged: true, cooldownElapsed: true });
    expect(result).toEqual({ action: 'none', resetRate: true });
  });

  it('is exactly at the dead-band boundary (not dead-band, enters soft band)', () => {
    const result = decideCorrection({
      drift: SYNC_DEAD_BAND_S,
      mode: 'rate',
      rateNudged: false,
      cooldownElapsed: true,
    });
    expect(result.action).toBe('nudge');
  });

  it('nudges within the soft band, behind (positive drift) speeds up (rate > 1)', () => {
    const result = decideCorrection({ drift: 0.5, mode: 'rate', rateNudged: false, cooldownElapsed: true });
    expect(result.action).toBe('nudge');
    if (result.action === 'nudge') {
      expect(result.rate).toBeGreaterThan(1);
    }
  });

  it('nudges within the soft band, ahead (negative drift) slows down (rate < 1)', () => {
    const result = decideCorrection({ drift: -0.5, mode: 'rate', rateNudged: false, cooldownElapsed: true });
    expect(result.action).toBe('nudge');
    if (result.action === 'nudge') {
      expect(result.rate).toBeLessThan(1);
    }
  });

  it('clamps nudge rate at +SYNC_MAX_NUDGE for large positive drift within soft band', () => {
    const result = decideCorrection({
      drift: SYNC_SOFT_BAND_S,
      mode: 'rate',
      rateNudged: false,
      cooldownElapsed: true,
    });
    expect(result.action).toBe('nudge');
    if (result.action === 'nudge') {
      expect(result.rate).toBeCloseTo(1 + SYNC_MAX_NUDGE, 5);
    }
  });

  it('clamps nudge rate at -SYNC_MAX_NUDGE for large negative drift within soft band', () => {
    const result = decideCorrection({
      drift: -SYNC_SOFT_BAND_S,
      mode: 'rate',
      rateNudged: false,
      cooldownElapsed: true,
    });
    expect(result.action).toBe('nudge');
    if (result.action === 'nudge') {
      expect(result.rate).toBeCloseTo(1 - SYNC_MAX_NUDGE, 5);
    }
  });

  it('seeks when drift exceeds the soft band and cooldown has elapsed', () => {
    const result = decideCorrection({
      drift: SYNC_SOFT_BAND_S + 0.5,
      mode: 'rate',
      rateNudged: false,
      cooldownElapsed: true,
    });
    expect(result).toEqual({ action: 'seek' });
  });

  it('does nothing when drift exceeds the soft band but cooldown is active', () => {
    const result = decideCorrection({
      drift: SYNC_SOFT_BAND_S + 0.5,
      mode: 'rate',
      rateNudged: true,
      cooldownElapsed: false,
    });
    expect(result).toEqual({ action: 'none', resetRate: true });
  });
});

describe('decideCorrection — mode: seek (YouTube/Cast)', () => {
  it('returns none below YOUTUBE_SEEK_TOLERANCE_S', () => {
    const result = decideCorrection({ drift: 0.5, mode: 'seek', rateNudged: false, cooldownElapsed: true });
    expect(result).toEqual({ action: 'none', resetRate: false });
  });

  it('seeks above YOUTUBE_SEEK_TOLERANCE_S when cooldown elapsed', () => {
    const result = decideCorrection({
      drift: YOUTUBE_SEEK_TOLERANCE_S + 0.1,
      mode: 'seek',
      rateNudged: false,
      cooldownElapsed: true,
    });
    expect(result).toEqual({ action: 'seek' });
  });

  it('does not seek above tolerance when cooldown is active', () => {
    const result = decideCorrection({
      drift: YOUTUBE_SEEK_TOLERANCE_S + 0.1,
      mode: 'seek',
      rateNudged: false,
      cooldownElapsed: false,
    });
    expect(result).toEqual({ action: 'none', resetRate: false });
  });

  it('never returns a nudge action, even for large drift', () => {
    const result = decideCorrection({ drift: 5, mode: 'seek', rateNudged: false, cooldownElapsed: true });
    expect(result.action).not.toBe('nudge');
  });

  it('handles negative drift (ahead) the same as positive (behind) via absolute value', () => {
    const result = decideCorrection({
      drift: -(YOUTUBE_SEEK_TOLERANCE_S + 0.1),
      mode: 'seek',
      rateNudged: false,
      cooldownElapsed: true,
    });
    expect(result).toEqual({ action: 'seek' });
  });
});

describe('shouldApplySyncUpdate', () => {
  it('drops stale anchors (anchor before last intent)', () => {
    expect(shouldApplySyncUpdate(1000, 2000)).toBe(false);
  });

  it('keeps fresh anchors (anchor after last intent)', () => {
    expect(shouldApplySyncUpdate(3000, 2000)).toBe(true);
  });

  it('keeps anchors at equal timestamps', () => {
    expect(shouldApplySyncUpdate(2000, 2000)).toBe(true);
  });
});
