'use client';

import { useState, useEffect } from 'react';

export function useFullscreenChatOverlay() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChatOverlay, setShowChatOverlay] = useState(false);
  const [isChatMinimized, setIsChatMinimized] = useState(false);

  // Handle fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
        (document as Document & { msFullscreenElement?: Element }).msFullscreenElement
      );

      console.log('Fullscreen state changed:', isCurrentlyFullscreen);
      setIsFullscreen(isCurrentlyFullscreen);

      // Show chat overlay when entering fullscreen
      if (isCurrentlyFullscreen) {
        console.log('Entering fullscreen - showing chat overlay');
        setShowChatOverlay(true);
        setIsChatMinimized(false);
      } else {
        console.log('Exiting fullscreen - hiding chat overlay');
        // Hide chat overlay when exiting fullscreen
        setShowChatOverlay(false);
        setIsChatMinimized(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    // Check initial fullscreen state
    handleFullscreenChange();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleChatMinimize = () => {
    setIsChatMinimized(prev => !prev);
  };

  const closeChatOverlay = () => {
    setShowChatOverlay(false);
  };

  const showChatOverlayManually = () => {
    console.log('showChatOverlayManually called, isFullscreen:', isFullscreen);
    // Always show chat overlay when manually triggered (e.g., via chat button)
    setShowChatOverlay(true);
    setIsChatMinimized(false);
  };

  return {
    isFullscreen,
    showChatOverlay,
    isChatMinimized,
    toggleChatMinimize,
    closeChatOverlay,
    showChatOverlayManually,
  };
}
