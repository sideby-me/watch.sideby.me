'use client';

import { useEffect, useRef } from 'react';
import type { Room } from '@/types/schemas';
import type { VideoPlayerRef } from '@/src/features/video-sync/components/VideoPlayer';
import type { HLSPlayerRef } from '@/src/core/video/hls-player';

/** The in-scope players for keyboard shortcuts — both expose play/pause/seekTo/getCurrentTime/
 *  getDuration/isPaused/getVideoElement. YouTube is excluded by the videoType gate below, so these
 *  methods are always safe to call on whatever `getActivePlayer()` resolves. */
export type ActiveShortcutPlayer = VideoPlayerRef | HLSPlayerRef;

export interface UseKeyboardShortcutsOptions {
  hasVideo: boolean;
  isHost: boolean;
  videoType?: Room['videoType'];
  onControlAttempt: () => void;
  getActivePlayer: () => ActiveShortcutPlayer | null;
  onPlay: () => void;
  onPause: () => void;
  onSeek: () => void;
}

/** Minimal duck-typed keyboard event — real `KeyboardEvent` satisfies this structurally. */
export interface KeyboardShortcutEvent {
  key: string;
  target: EventTarget | null;
  preventDefault: () => void;
}

/** Minimal duck-typed document surface used for the button/anchor guard and the fullscreen
 *  toggle, so the handler can be unit tested with a plain mock instead of a real DOM. */
export interface KeyboardShortcutsDocument {
  activeElement: Element | null;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  exitFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  msExitFullscreen?: () => void;
}

type FullscreenContainer = HTMLElement & {
  webkitRequestFullscreen?: () => void;
  msRequestFullscreen?: () => void;
};

export interface KeyboardShortcutHandler {
  (event: KeyboardShortcutEvent): void;
  dispose: () => void;
}

const SEEK_STEP_SECONDS = 10;
const SEEK_DEBOUNCE_MS = 250;

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as (Element & { isContentEditable?: boolean }) | null;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable === true ||
    el.getAttribute?.('role') === 'textbox'
  );
}

function isButtonOrAnchor(el: Element | null, includeAnchor: boolean): boolean {
  if (!el) return false;
  return el.tagName === 'BUTTON' || (includeAnchor && el.tagName === 'A');
}

/** Mirrors VideoControls.handleFullscreen — same enter/exit branching + vendor fallbacks. */
function toggleFullscreen(container: FullscreenContainer, doc: KeyboardShortcutsDocument) {
  const isCurrentlyFullscreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement);

  if (isCurrentlyFullscreen) {
    if (doc.exitFullscreen) doc.exitFullscreen();
    else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    else if (doc.msExitFullscreen) doc.msExitFullscreen();
    return;
  }

  if (container.requestFullscreen) container.requestFullscreen();
  else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
  else if (container.msRequestFullscreen) container.msRequestFullscreen();
}

/**
 * Builds the document-level keydown handler as a standalone factory (not wrapped in
 * `useEffect`) so it can be unit tested with plain mock event/document objects instead of a
 * real DOM. `getDeps` is re-read on every keypress so identity changes to the host broadcast
 * callbacks never require re-subscribing the listener and never drop a pending coalesced seek.
 */
export function createKeyboardShortcutHandler(
  getDeps: () => UseKeyboardShortcutsOptions,
  doc: KeyboardShortcutsDocument
): KeyboardShortcutHandler {
  let seekTimer: ReturnType<typeof setTimeout> | null = null;

  const clearSeekTimer = () => {
    if (seekTimer !== null) {
      clearTimeout(seekTimer);
      seekTimer = null;
    }
  };

  const handleKeydown = (event: KeyboardShortcutEvent) => {
    const { hasVideo, isHost, videoType, onControlAttempt, getActivePlayer, onPlay, onPause, onSeek } = getDeps();

    // Gate A: no video, or YouTube — the iframe owns its own keys entirely.
    if (!hasVideo || videoType === 'youtube') return;

    // Gate B: don't intercept while the user is typing (isContentEditable, not the
    // string-compare form which returns "inherit" for nested nodes).
    if (isTypingTarget(event.target)) return;

    const { key } = event;

    // Local keys — mute (M) and fullscreen (F) act on the caller's own player only.
    // No broadcast, no ask-the-host dialog, for host and guest alike.
    if (key === 'm' || key === 'M') {
      const el = getActivePlayer()?.getVideoElement();
      if (el) el.muted = !el.muted;
      return;
    }

    if (key === 'f' || key === 'F') {
      const el = getActivePlayer()?.getVideoElement();
      const container = el?.closest('[data-video-container]') as FullscreenContainer | null;
      if (container) toggleFullscreen(container, doc);
      return;
    }

    const isSyncedKey = key === ' ' || key === 'Enter' || key === 'ArrowLeft' || key === 'ArrowRight';
    // Dropped keys (ArrowUp/ArrowDown, j/k/l, anything else): plain browser behavior, no-op.
    if (!isSyncedKey) return;

    if (!isHost) {
      event.preventDefault();
      onControlAttempt();
      return;
    }

    // Host: play/pause.
    if (key === ' ' || key === 'Enter') {
      const isEnter = key === 'Enter';
      const eventTargetEl = event.target as Element | null;
      if (isButtonOrAnchor(eventTargetEl, isEnter) || isButtonOrAnchor(doc.activeElement, isEnter)) {
        // A button/anchor already owns this keypress (e.g. the play button was just
        // clicked) — let the native control act instead of double-triggering.
        return;
      }

      event.preventDefault();
      const player = getActivePlayer();
      if (!player) return;

      if (player.isPaused()) {
        player.play();
        onPlay();
      } else {
        player.pause();
        onPause();
      }
      return;
    }

    // Host: seek ∓10s. Apply immediately for responsive scrubbing, but coalesce the
    // socket broadcast under key-repeat with a trailing debounce.
    event.preventDefault();
    const player = getActivePlayer();
    if (!player) return;

    const direction = key === 'ArrowLeft' ? -1 : 1;
    const duration = player.getDuration();
    const upperBound = duration > 0 ? duration : Number.POSITIVE_INFINITY;
    const target = Math.min(Math.max(player.getCurrentTime() + direction * SEEK_STEP_SECONDS, 0), upperBound);
    player.seekTo(target);

    clearSeekTimer();
    seekTimer = setTimeout(() => {
      seekTimer = null;
      getDeps().onSeek();
    }, SEEK_DEBOUNCE_MS);
  };

  const handler = handleKeydown as KeyboardShortcutHandler;
  handler.dispose = clearSeekTimer;
  return handler;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handler = createKeyboardShortcutHandler(
      () => optionsRef.current,
      document as unknown as KeyboardShortcutsDocument
    );
    document.addEventListener('keydown', handler as unknown as EventListener);

    return () => {
      document.removeEventListener('keydown', handler as unknown as EventListener);
      handler.dispose();
    };
  }, []);
}
