'use client';

import { useEffect, useState } from 'react';
import type { SubtitleTrack } from '@/types/schemas';
import { SubtitleParser, type SubtitleCue as ParsedSubtitleCue } from '@/lib/subtitle-utils';
import { useSubtitleSettings } from '@/lib/subtitle-settings-store';

interface SubtitleCue {
  text: string;
  startTime: number;
  endTime: number;
}

interface SubtitleOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement> | null;
  subtitleTracks: SubtitleTrack[];
  activeSubtitleTrack?: string;
  controlsVisible: boolean;
  isFullscreen: boolean;
}

// Helper function to convert parsed subtitle cue to component's expected format
const convertSubtitleCue = (parsedCue: ParsedSubtitleCue): SubtitleCue => ({
  text: parsedCue.text,
  startTime: parsedCue.start,
  endTime: parsedCue.end,
});

export function SubtitleOverlay({
  videoRef,
  subtitleTracks,
  activeSubtitleTrack,
  controlsVisible,
  isFullscreen,
}: SubtitleOverlayProps) {
  const [currentCue, setCurrentCue] = useState<SubtitleCue | null>(null);
  const [parsedCues, setParsedCues] = useState<SubtitleCue[]>([]);
  const { settings } = useSubtitleSettings();

  // Load and parse subtitle file
  useEffect(() => {
    if (!activeSubtitleTrack) {
      setParsedCues([]);
      setCurrentCue(null);
      return;
    }

    const activeTrack = subtitleTracks.find(track => track.id === activeSubtitleTrack);
    if (!activeTrack) {
      setParsedCues([]);
      setCurrentCue(null);
      return;
    }

    // Fetch and parse the subtitle file
    fetch(activeTrack.url)
      .then(response => response.text())
      .then(content => {
        const parsedCues = SubtitleParser.parseVTT(content);
        const cues = parsedCues.map(convertSubtitleCue);
        setParsedCues(cues);
      })
      .catch(error => {
        console.error('Error loading subtitle file:', error);
        setParsedCues([]);
      });
  }, [activeSubtitleTrack, subtitleTracks]);

  // Update current cue based on video time (with syncOffset applied)
  useEffect(() => {
    if (!videoRef?.current || parsedCues.length === 0) {
      setCurrentCue(null);
      return;
    }

    const video = videoRef.current;

    const updateCurrentCue = () => {
      // Apply sync offset: positive = subtitles appear later, negative = earlier
      const adjustedTime = video.currentTime - settings.syncOffset;
      const activeCue = parsedCues.find(cue => adjustedTime >= cue.startTime && adjustedTime <= cue.endTime);
      setCurrentCue(activeCue || null);
    };

    // Initial update
    updateCurrentCue();

    // Listen for time updates
    video.addEventListener('timeupdate', updateCurrentCue);
    video.addEventListener('seeked', updateCurrentCue);

    return () => {
      video.removeEventListener('timeupdate', updateCurrentCue);
      video.removeEventListener('seeked', updateCurrentCue);
    };
  }, [videoRef, parsedCues, settings.syncOffset]);

  // Don't render if no current cue
  if (!currentCue) {
    return null;
  }

  // Calculate positioning based on settings and controls visibility
  const getPositionStyles = () => {
    // Base offset from user settings (percentage of container height)
    const baseOffsetPercent = settings.verticalPosition;

    // Additional offset when controls are visible
    let additionalOffset = 0;
    if (controlsVisible) {
      additionalOffset = isFullscreen ? 120 : 80;
    }

    return {
      bottom: `calc(${baseOffsetPercent}% + ${additionalOffset}px)`,
    };
  };

  // Calculate font size based on settings
  const getFontSize = () => {
    const baseSize = isFullscreen ? 1.25 : 1; // rem
    return `${(baseSize * settings.fontSize) / 100}rem`;
  };

  // Build background styles
  const getBackgroundStyles = () => {
    const styles: React.CSSProperties = {};

    if (settings.backgroundFill) {
      styles.backgroundColor = 'rgba(0, 0, 0, 0.75)';
      styles.border = '1px solid rgba(255, 255, 255, 0.1)';
    } else {
      styles.backgroundColor = 'transparent';
    }

    if (settings.backgroundBlur) {
      styles.backdropFilter = 'blur(8px)';
      styles.WebkitBackdropFilter = 'blur(8px)';
    }

    // Only add text shadow when there's no background (for readability on video)
    if (!settings.backgroundFill && !settings.backgroundBlur) {
      styles.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.9), 0 0 8px rgba(0, 0, 0, 0.5)';
    }

    return styles;
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 z-30 flex justify-center" style={getPositionStyles()}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2 text-center ${isFullscreen ? 'max-w-[70%]' : ''} text-white`}
        style={{
          fontFamily: 'var(--font-space-grotesk), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontWeight: settings.isBold ? 700 : 500,
          fontSize: getFontSize(),
          lineHeight: isFullscreen ? '1.15' : '1.25',
          whiteSpace: 'pre-line',
          letterSpacing: '0.02em',
          ...getBackgroundStyles(),
        }}
      >
        {currentCue.text}
      </div>
    </div>
  );
}
