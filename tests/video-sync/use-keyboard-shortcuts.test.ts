import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createKeyboardShortcutHandler,
  type KeyboardShortcutEvent,
  type KeyboardShortcutsDocument,
  type UseKeyboardShortcutsOptions,
  type ActiveShortcutPlayer,
} from '@/src/core/input/use-keyboard-shortcuts';

// ── Test doubles ─────────────────────────────────────────────────────────────

function makeEvent(key: string, target: Partial<Element> | null = null): KeyboardShortcutEvent & {
  preventDefault: ReturnType<typeof vi.fn>;
} {
  return {
    key,
    target: target as EventTarget | null,
    preventDefault: vi.fn(),
  };
}

function makeDoc(overrides: Partial<KeyboardShortcutsDocument> = {}): KeyboardShortcutsDocument {
  return {
    activeElement: null,
    fullscreenElement: null,
    exitFullscreen: vi.fn(),
    ...overrides,
  };
}

function makeVideoElement(overrides: Partial<HTMLVideoElement> = {}) {
  const container = {
    tagName: 'DIV',
    requestFullscreen: vi.fn(),
  };
  const el = {
    muted: false,
    closest: vi.fn(() => container),
    ...overrides,
  };
  return { el, container };
}

function makePlayer(overrides: Partial<ActiveShortcutPlayer> = {}): ActiveShortcutPlayer {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    getCurrentTime: vi.fn(() => 50),
    getDuration: vi.fn(() => 100),
    isPaused: vi.fn(() => true),
    getVideoElement: vi.fn(() => null),
    ...overrides,
  } as unknown as ActiveShortcutPlayer;
}

function makeDeps(overrides: Partial<UseKeyboardShortcutsOptions> = {}): UseKeyboardShortcutsOptions {
  return {
    hasVideo: true,
    isHost: false,
    videoType: 'mp4',
    onControlAttempt: vi.fn(),
    getActivePlayer: vi.fn(() => null),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onSeek: vi.fn(),
    ...overrides,
  };
}

describe('use-keyboard-shortcuts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Test A: no-op when there is no video or the video is YouTube.
  it('no-ops entirely when hasVideo is false', () => {
    const deps = makeDeps({ hasVideo: false, isHost: false });
    const handler = createKeyboardShortcutHandler(() => deps, makeDoc());

    handler(makeEvent('ArrowLeft'));

    expect(deps.onControlAttempt).not.toHaveBeenCalled();
  });

  it('no-ops entirely when videoType is youtube', () => {
    const deps = makeDeps({ videoType: 'youtube', isHost: true });
    const handler = createKeyboardShortcutHandler(() => deps, makeDoc());

    handler(makeEvent(' '));

    expect(deps.onPlay).not.toHaveBeenCalled();
    expect(deps.onControlAttempt).not.toHaveBeenCalled();
  });

  // Test B: typing guard uses isContentEditable, not the string-compare form.
  it('ignores shortcuts while typing (isContentEditable true)', () => {
    const deps = makeDeps({ isHost: false });
    const handler = createKeyboardShortcutHandler(() => deps, makeDoc());

    handler(makeEvent('ArrowLeft', { tagName: 'DIV', isContentEditable: true } as Partial<Element>));

    expect(deps.onControlAttempt).not.toHaveBeenCalled();
  });

  it('ignores shortcuts while typing in an INPUT', () => {
    const deps = makeDeps({ isHost: false });
    const handler = createKeyboardShortcutHandler(() => deps, makeDoc());

    handler(makeEvent('ArrowLeft', { tagName: 'INPUT' } as Partial<Element>));

    expect(deps.onControlAttempt).not.toHaveBeenCalled();
  });

  // Test C: M toggles the active player's mute locally, for host and guest alike.
  it('M toggles mute on the active player without calling onControlAttempt (guest)', () => {
    const { el } = makeVideoElement({ muted: false } as Partial<HTMLVideoElement>);
    const player = makePlayer({ getVideoElement: vi.fn(() => el as unknown as HTMLVideoElement) });
    const deps = makeDeps({ isHost: false, getActivePlayer: vi.fn(() => player) });
    const handler = createKeyboardShortcutHandler(() => deps, makeDoc());

    handler(makeEvent('m'));

    expect(el.muted).toBe(true);
    expect(deps.onControlAttempt).not.toHaveBeenCalled();
  });

  it('M toggles mute on the active player for the host too (no broadcast)', () => {
    const { el } = makeVideoElement({ muted: true } as Partial<HTMLVideoElement>);
    const player = makePlayer({ getVideoElement: vi.fn(() => el as unknown as HTMLVideoElement) });
    const deps = makeDeps({ isHost: true, getActivePlayer: vi.fn(() => player) });
    const handler = createKeyboardShortcutHandler(() => deps, makeDoc());

    handler(makeEvent('M'));

    expect(el.muted).toBe(false);
    expect(deps.onPlay).not.toHaveBeenCalled();
    expect(deps.onPause).not.toHaveBeenCalled();
  });

  // Test D: F toggles fullscreen on the closest [data-video-container], no broadcast/dialog.
  it('F enters fullscreen on the video container when nothing is fullscreen', () => {
    const { el, container } = makeVideoElement();
    const player = makePlayer({ getVideoElement: vi.fn(() => el as unknown as HTMLVideoElement) });
    const deps = makeDeps({ isHost: false, getActivePlayer: vi.fn(() => player) });
    const handler = createKeyboardShortcutHandler(() => deps, makeDoc({ fullscreenElement: null }));

    handler(makeEvent('f'));

    expect(container.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(deps.onControlAttempt).not.toHaveBeenCalled();
  });

  it('F exits fullscreen via doc.exitFullscreen when already fullscreen', () => {
    const { el, container } = makeVideoElement();
    const player = makePlayer({ getVideoElement: vi.fn(() => el as unknown as HTMLVideoElement) });
    const deps = makeDeps({ isHost: true, getActivePlayer: vi.fn(() => player) });
    const doc = makeDoc({ fullscreenElement: { tagName: 'DIV' } as unknown as Element });
    const handler = createKeyboardShortcutHandler(() => deps, doc);

    handler(makeEvent('F'));

    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(container.requestFullscreen).not.toHaveBeenCalled();
    expect(deps.onControlAttempt).not.toHaveBeenCalled();
  });

  // Test E: guest ArrowLeft is blocked with preventDefault + onControlAttempt.
  it('guest ArrowLeft calls preventDefault and onControlAttempt', () => {
    const deps = makeDeps({ isHost: false });
    const handler = createKeyboardShortcutHandler(() => deps, makeDoc());
    const event = makeEvent('ArrowLeft');

    handler(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.onControlAttempt).toHaveBeenCalledTimes(1);
  });

  it('guest Space/Enter/ArrowRight are also blocked', () => {
    for (const key of [' ', 'Enter', 'ArrowRight']) {
      const deps = makeDeps({ isHost: false });
      const handler = createKeyboardShortcutHandler(() => deps, makeDoc());
      const event = makeEvent(key);

      handler(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(deps.onControlAttempt).toHaveBeenCalledTimes(1);
    }
  });

  // Test F: host Space toggles play/pause and broadcasts.
  it('host Space plays a paused player and calls onPlay', () => {
    const player = makePlayer({ isPaused: vi.fn(() => true) });
    const deps = makeDeps({ isHost: true, getActivePlayer: vi.fn(() => player) });
    const handler = createKeyboardShortcutHandler(() => deps, makeDoc());

    handler(makeEvent(' '));

    expect(player.play).toHaveBeenCalledTimes(1);
    expect(deps.onPlay).toHaveBeenCalledTimes(1);
    expect(deps.onPause).not.toHaveBeenCalled();
  });

  it('host Space pauses a playing player and calls onPause', () => {
    const player = makePlayer({ isPaused: vi.fn(() => false) });
    const deps = makeDeps({ isHost: true, getActivePlayer: vi.fn(() => player) });
    const handler = createKeyboardShortcutHandler(() => deps, makeDoc());

    handler(makeEvent(' '));

    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(deps.onPause).toHaveBeenCalledTimes(1);
    expect(deps.onPlay).not.toHaveBeenCalled();
  });

  // Test G: host Space is ignored when a button owns the keypress (double-trigger guard).
  it('host Space is ignored when document.activeElement is a button', () => {
    const player = makePlayer({ isPaused: vi.fn(() => true) });
    const deps = makeDeps({ isHost: true, getActivePlayer: vi.fn(() => player) });
    const doc = makeDoc({ activeElement: { tagName: 'BUTTON' } as unknown as Element });
    const handler = createKeyboardShortcutHandler(() => deps, doc);
    const event = makeEvent(' ');

    handler(event);

    expect(player.play).not.toHaveBeenCalled();
    expect(player.pause).not.toHaveBeenCalled();
    expect(deps.onPlay).not.toHaveBeenCalled();
    expect(deps.onPause).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('host Enter is ignored when the event target is an anchor', () => {
    const player = makePlayer({ isPaused: vi.fn(() => true) });
    const deps = makeDeps({ isHost: true, getActivePlayer: vi.fn(() => player) });
    const handler = createKeyboardShortcutHandler(() => deps, makeDoc());
    const event = makeEvent('Enter', { tagName: 'A' } as Partial<Element>);

    handler(event);

    expect(player.play).not.toHaveBeenCalled();
    expect(deps.onPlay).not.toHaveBeenCalled();
  });

  // Test H: host ArrowRight fired rapidly applies seekTo every time but coalesces onSeek.
  it('coalesces repeated ArrowRight seeks into a single trailing onSeek', () => {
    const player = makePlayer();
    const deps = makeDeps({ isHost: true, getActivePlayer: vi.fn(() => player) });
    const handler = createKeyboardShortcutHandler(() => deps, makeDoc());

    for (let i = 0; i < 5; i++) {
      handler(makeEvent('ArrowRight'));
    }

    expect(player.seekTo).toHaveBeenCalledTimes(5);
    expect(deps.onSeek).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(deps.onSeek).toHaveBeenCalledTimes(1);
  });

  it('clamps seek target to [0, duration]', () => {
    const player = makePlayer({ getCurrentTime: vi.fn(() => 5), getDuration: vi.fn(() => 100) });
    const deps = makeDeps({ isHost: true, getActivePlayer: vi.fn(() => player) });
    const handler = createKeyboardShortcutHandler(() => deps, makeDoc());

    handler(makeEvent('ArrowLeft'));

    expect(player.seekTo).toHaveBeenCalledWith(0);
  });

  // Test I: dropped keys (ArrowUp/ArrowDown, j/k/l) are fully ignored for guests and hosts.
  it('does not intercept ArrowUp/ArrowDown or j/k/l', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'j', 'k', 'l']) {
      const deps = makeDeps({ isHost: false });
      const handler = createKeyboardShortcutHandler(() => deps, makeDoc());
      const event = makeEvent(key);

      handler(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(deps.onControlAttempt).not.toHaveBeenCalled();
    }
  });

  it('does not intercept dropped keys for the host either', () => {
    const player = makePlayer();
    for (const key of ['ArrowUp', 'ArrowDown', 'j', 'k', 'l']) {
      const deps = makeDeps({ isHost: true, getActivePlayer: vi.fn(() => player) });
      const handler = createKeyboardShortcutHandler(() => deps, makeDoc());
      const event = makeEvent(key);

      handler(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(deps.onPlay).not.toHaveBeenCalled();
      expect(deps.onSeek).not.toHaveBeenCalled();
    }
  });

  // Stale-closure safety: latest handlers are read on every keypress via getDeps().
  it('reads the latest onSeek handler at debounce fire-time, not at keydown-time', () => {
    const player = makePlayer();
    let deps = makeDeps({ isHost: true, getActivePlayer: vi.fn(() => player) });
    const handler = createKeyboardShortcutHandler(() => deps, makeDoc());

    handler(makeEvent('ArrowRight'));

    const latestOnSeek = vi.fn();
    deps = { ...deps, onSeek: latestOnSeek };

    vi.advanceTimersByTime(300);

    expect(latestOnSeek).toHaveBeenCalledTimes(1);
  });

  it('disposes the pending debounce timer, preventing a late onSeek call', () => {
    const player = makePlayer();
    const deps = makeDeps({ isHost: true, getActivePlayer: vi.fn(() => player) });
    const handler = createKeyboardShortcutHandler(() => deps, makeDoc());

    handler(makeEvent('ArrowRight'));
    handler.dispose();

    vi.advanceTimersByTime(300);

    expect(deps.onSeek).not.toHaveBeenCalled();
  });
});
