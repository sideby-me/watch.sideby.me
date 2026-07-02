import { describe, it, expect } from 'vitest';
import {
  createHlsRecoveryState,
  decideHlsRecovery,
  classifyHlsError,
  NETWORK_ERROR_WINDOW_MS,
  MAX_NETWORK_ERRORS_IN_WINDOW,
  MAX_NETWORK_RELOADS,
  MAX_MEDIA_ERROR_RECOVERIES,
} from '@/src/core/video/hls-error-policy';

describe('decideHlsRecovery — buffer stall', () => {
  it('bufferStalledError with fatal=false -> ignore', () => {
    const state = createHlsRecoveryState();
    const result = decideHlsRecovery({
      error: { type: 'mediaError', details: 'bufferStalledError', fatal: false },
      state,
      now: 0,
    });
    expect(result.action).toBe('ignore');
  });
});

describe('decideHlsRecovery — transient network errors', () => {
  it('a single transient networkish error (fragLoadError, fatal=false, no responseCode) -> ignore', () => {
    const state = createHlsRecoveryState();
    const result = decideHlsRecovery({
      error: { type: 'networkError', details: 'fragLoadError', fatal: false },
      state,
      now: 0,
    });
    expect(result.action).toBe('ignore');
  });

  it('hard HTTP block (responseCode >= 400) -> terminal immediately', () => {
    const state = createHlsRecoveryState();
    const result = decideHlsRecovery({
      error: { type: 'networkError', details: 'fragLoadError', fatal: false, responseCode: 403 },
      state,
      now: 0,
    });
    expect(result.action).toBe('terminal');
  });

  it('THE BUG: two networkish errors more than NETWORK_ERROR_WINDOW_MS apart do NOT accumulate to terminal', () => {
    const state = createHlsRecoveryState();
    const first = decideHlsRecovery({
      error: { type: 'networkError', details: 'fragLoadError', fatal: false },
      state,
      now: 0,
    });
    expect(first.action).not.toBe('terminal');

    const second = decideHlsRecovery({
      error: { type: 'networkError', details: 'fragLoadError', fatal: false },
      state,
      now: NETWORK_ERROR_WINDOW_MS + 1000,
    });
    expect(second.action).not.toBe('terminal');
    // The stale first timestamp must have been pruned before counting the second.
    expect(state.networkErrorTimestamps).toEqual([NETWORK_ERROR_WINDOW_MS + 1000]);
  });

  it('a burst of non-fatal networkish errors WITHIN the window exceeding the threshold -> terminal', () => {
    const state = createHlsRecoveryState();
    let last;
    for (let i = 0; i <= MAX_NETWORK_ERRORS_IN_WINDOW; i++) {
      last = decideHlsRecovery({
        error: { type: 'networkError', details: 'fragLoadError', fatal: false },
        state,
        now: i * 100, // all well within the window
      });
    }
    expect(last!.action).toBe('terminal');
  });
});

describe('decideHlsRecovery — fatal network reload chain', () => {
  it('fatal networkError, first occurrence -> reload-network, increments networkReloadCount', () => {
    const state = createHlsRecoveryState();
    const result = decideHlsRecovery({
      error: { type: 'networkError', details: 'manifestLoadError', fatal: true },
      state,
      now: 0,
    });
    expect(result.action).toBe('reload-network');
    expect(state.networkReloadCount).toBe(1);
  });

  it('fatal networkError repeated past MAX_NETWORK_RELOADS within the window -> terminal', () => {
    const state = createHlsRecoveryState();
    let last;
    for (let i = 0; i < MAX_NETWORK_RELOADS + 1; i++) {
      last = decideHlsRecovery({
        error: { type: 'networkError', details: 'manifestLoadError', fatal: true },
        state,
        now: i * 100,
      });
    }
    expect(last!.action).toBe('terminal');
    expect(state.networkReloadCount).toBe(MAX_NETWORK_RELOADS);
  });
});

describe('decideHlsRecovery — fatal media error recover -> reattach -> terminal chain', () => {
  it('recovers up to MAX_MEDIA_ERROR_RECOVERIES, then reattaches once, then terminal', () => {
    const state = createHlsRecoveryState();
    const actions: string[] = [];
    for (let i = 0; i < MAX_MEDIA_ERROR_RECOVERIES + 2; i++) {
      const result = decideHlsRecovery({
        error: { type: 'mediaError', details: 'bufferAppendError', fatal: true },
        state,
        now: i * 100,
      });
      actions.push(result.action);
    }
    expect(actions.slice(0, MAX_MEDIA_ERROR_RECOVERIES)).toEqual(
      Array(MAX_MEDIA_ERROR_RECOVERIES).fill('recover-media')
    );
    expect(actions[MAX_MEDIA_ERROR_RECOVERIES]).toBe('reattach');
    expect(actions[MAX_MEDIA_ERROR_RECOVERIES + 1]).toBe('terminal');
  });
});

describe('decideHlsRecovery — unrecoverable codec error', () => {
  it('bufferAddCodecError -> terminal immediately', () => {
    const state = createHlsRecoveryState();
    const result = decideHlsRecovery({
      error: { type: 'mediaError', details: 'bufferAddCodecError', fatal: true },
      state,
      now: 0,
    });
    expect(result.action).toBe('terminal');
  });
});

describe('classifyHlsError', () => {
  it('flags fragParsingError as codecUnparsable', () => {
    expect(classifyHlsError('fragParsingError').codecUnparsable).toBe(true);
  });

  it('flags manifestParsingError as codecUnparsable', () => {
    expect(classifyHlsError('manifestParsingError').codecUnparsable).toBe(true);
  });

  it('does not flag an unrelated error detail', () => {
    expect(classifyHlsError('fragLoadError').codecUnparsable).toBe(false);
  });
});
