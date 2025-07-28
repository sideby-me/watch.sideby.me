'use client';

import { useEffect, useState } from 'react';
import type { SubtitleTrack } from '@/types/schemas';

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

export function SubtitleOverlay({
  videoRef,
  subtitleTracks,
  activeSubtitleTrack,
  controlsVisible,
  isFullscreen,
}: SubtitleOverlayProps) {
  const [currentCue, setCurrentCue] = useState<SubtitleCue | null>(null);
  const [parsedCues, setParsedCues] = useState<SubtitleCue[]>([]);

  // Parse WebVTT content
  const parseWebVTT = (content: string): SubtitleCue[] => {
    const lines = content.split('\n');
    const cues: SubtitleCue[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Look for timestamp lines (format: 00:00:00.000 --> 00:00:00.000)
      if (line.includes(' --> ')) {
        const [startStr, endStr] = line.split(' --> ');
        const startTime = parseTimestamp(startStr);
        const endTime = parseTimestamp(endStr);

        // Get the text lines that follow
        const textLines: string[] = [];
        i++; // Move to next line after timestamp

        while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes(' --> ')) {
          if (lines[i].trim()) {
            textLines.push(lines[i].trim());
          }
          i++;
        }
        i--; // Back up one line since the outer loop will increment

        if (textLines.length > 0) {
          cues.push({
            text: textLines.join('\n'),
            startTime,
            endTime,
          });
        }
      }
    }

    return cues;
  };

  // Parse timestamp string to seconds
  const parseTimestamp = (timestamp: string): number => {
    const parts = timestamp.split(':');
    if (parts.length === 3) {
      const hours = parseInt(parts[0]);
      const minutes = parseInt(parts[1]);
      const secondsParts = parts[2].split('.');
      const seconds = parseInt(secondsParts[0]);
      const milliseconds = secondsParts[1] ? parseInt(secondsParts[1].padEnd(3, '0')) : 0;

      return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
    }
    return 0;
  };

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
        const cues = parseWebVTT(content);
        setParsedCues(cues);
      })
      .catch(error => {
        console.error('Error loading subtitle file:', error);
        setParsedCues([]);
      });
  }, [activeSubtitleTrack, subtitleTracks]);

  // Update current cue based on video time
  useEffect(() => {
    if (!videoRef?.current || parsedCues.length === 0) {
      setCurrentCue(null);
      return;
    }

    const video = videoRef.current;

    const updateCurrentCue = () => {
      const currentTime = video.currentTime;
      const activeCue = parsedCues.find(cue => currentTime >= cue.startTime && currentTime <= cue.endTime);
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
  }, [videoRef, parsedCues]);

  // Don't render if no current cue
  if (!currentCue) {
    return null;
  }

  // Calculate positioning
  const getPositionStyles = () => {
    let bottomOffset = 40; // Base offset from bottom (moved up from 20)

    if (controlsVisible) {
      bottomOffset = isFullscreen ? 160 : 120; // Push up when controls are visible (increased)
    }

    return {
      bottom: `${bottomOffset}px`,
    };
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 z-30 flex justify-center" style={getPositionStyles()}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2 text-center ${isFullscreen ? 'max-w-[70%] text-xl' : 'text-sm sm:text-base'} border border-white/10 bg-black/75 text-white shadow-2xl backdrop-blur-sm`}
        style={{
          fontFamily: 'var(--font-space-grotesk), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontWeight: '500',
          textShadow: '2px 2px 4px rgba(0, 0, 0, 0.9), 0 0 8px rgba(0, 0, 0, 0.5)',
          lineHeight: isFullscreen ? '1.15' : '1.25',
          whiteSpace: 'pre-line',
          letterSpacing: '0.02em',
        }}
      >
        {currentCue.text}
      </div>
    </div>
  );
}
