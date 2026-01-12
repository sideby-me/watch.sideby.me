'use client';

import { useEffect } from 'react';

interface UseKeyboardShortcutsOptions {
  hasVideo: boolean;
  isHost: boolean;
  onControlAttempt: () => void;
}

export function useKeyboardShortcuts({ hasVideo, isHost, onControlAttempt }: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Only handle shortcuts if there's a video and user is not a host
      if (!hasVideo || isHost) return;

      // Don't block shortcuts if user is typing in an input field
      const target = event.target as HTMLElement;
      const isTypingInInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.getAttribute('role') === 'textbox';

      if (isTypingInInput) return;

      // Common video shortcuts that guests might try
      const videoShortcuts = [' ', 'k', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'j', 'l', 'f', 'm'];

      if (videoShortcuts.includes(event.key)) {
        // Prevent default behavior and show dialog
        event.preventDefault();
        onControlAttempt();
      }
    };

    // Only add listener if user is a guest with video present
    if (hasVideo && !isHost) {
      document.addEventListener('keydown', handleKeyPress);
      return () => document.removeEventListener('keydown', handleKeyPress);
    }
  }, [hasVideo, isHost, onControlAttempt]);
}
