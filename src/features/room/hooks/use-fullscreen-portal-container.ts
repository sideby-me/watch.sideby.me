'use client';

import { useState, useEffect } from 'react';

// Hook to get the appropriate portal container for fullscreen mode and returns the fullscreen element when in fullscreen, null otherwise.
export function useFullscreenPortalContainer() {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const getFullscreenElement = () => {
      return (
        document.fullscreenElement ||
        (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
        (document as Document & { mozFullScreenElement?: Element }).mozFullScreenElement ||
        (document as Document & { msFullscreenElement?: Element }).msFullscreenElement
      );
    };

    const updatePortalContainer = () => {
      const fullscreenElement = getFullscreenElement();
      setPortalContainer(fullscreenElement as HTMLElement | null);
    };
    updatePortalContainer();

    // Listen for fullscreen changes
    const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'msfullscreenchange'];
    events.forEach(event => {
      document.addEventListener(event, updatePortalContainer);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updatePortalContainer);
      });
    };
  }, []);

  return portalContainer;
}
