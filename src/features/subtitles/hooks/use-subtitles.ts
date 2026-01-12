'use client';

import { useState, useCallback, useEffect } from 'react';
import type { SubtitleTrack } from '@/types/schemas';

interface UseSubtitlesOptions {
  roomId: string;
  videoId?: string;
  // Legacy props kept for compatibility (no longer used)
  isHost?: boolean;
  currentSubtitleTracks?: SubtitleTrack[];
  currentActiveTrack?: string;
}

interface UseSubtitlesReturn {
  // State
  subtitleTracks: SubtitleTrack[];
  activeTrackId?: string;
  // Actions
  addSubtitleTracks: (newTracks: SubtitleTrack[]) => void;
  removeSubtitleTrack: (trackId: string) => void;
  setActiveSubtitleTrack: (trackId?: string) => void;
  updateSubtitleTracks: (tracks: SubtitleTrack[]) => void;
  updateSubtitleTracksAndActive: (tracks: SubtitleTrack[], activeTrackId?: string) => void;
}

// Hook for managing subtitles locally without socket synchronization
// Subtitles are stored per room/video combination in localStorage
export function useSubtitles({ roomId, videoId }: UseSubtitlesOptions): UseSubtitlesReturn {
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [activeTrackId, setActiveTrackId] = useState<string | undefined>();

  // Create a unique storage key for this room/video combination
  const storageKey = `subtitles_${roomId}${videoId ? `_${videoId}` : ''}`;
  const activeTrackKey = `subtitle_active_${roomId}${videoId ? `_${videoId}` : ''}`;

  // Load subtitles from localStorage on mount and when key changes
  useEffect(() => {
    try {
      const storedTracks = localStorage.getItem(storageKey);
      const storedActiveTrack = localStorage.getItem(activeTrackKey);

      if (storedTracks) {
        const tracks = JSON.parse(storedTracks) as SubtitleTrack[];
        setSubtitleTracks(tracks);
      } else {
        setSubtitleTracks([]);
      }

      if (storedActiveTrack && storedActiveTrack !== 'undefined') {
        setActiveTrackId(storedActiveTrack);
      } else {
        setActiveTrackId(undefined);
      }
    } catch (error) {
      console.error('Failed to load subtitles from localStorage:', error);
      setSubtitleTracks([]);
      setActiveTrackId(undefined);
    }
  }, [storageKey, activeTrackKey]);

  // Save subtitles to localStorage whenever they change
  const saveToStorage = useCallback(
    (tracks: SubtitleTrack[], activeId?: string) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(tracks));
        if (activeId !== undefined) {
          localStorage.setItem(activeTrackKey, activeId || '');
        }
      } catch (error) {
        console.error('Failed to save subtitles to localStorage:', error);
      }
    },
    [storageKey, activeTrackKey]
  );

  // Add new subtitle tracks
  const addSubtitleTracks = useCallback(
    (newTracks: SubtitleTrack[]) => {
      setSubtitleTracks(prev => {
        const updatedTracks = [...prev, ...newTracks];

        // Auto-select the first new track if no track is currently active
        let newActiveTrackId = activeTrackId;
        if (!activeTrackId && newTracks.length > 0) {
          newActiveTrackId = newTracks[0].id;
          setActiveTrackId(newActiveTrackId);
        }

        saveToStorage(updatedTracks, newActiveTrackId);
        return updatedTracks;
      });
    },
    [activeTrackId, saveToStorage]
  );

  // Remove a subtitle track
  const removeSubtitleTrack = useCallback(
    (trackId: string) => {
      setSubtitleTracks(prev => {
        const updatedTracks = prev.filter(track => track.id !== trackId);

        // If we removed the active track, clear the active track
        let newActiveTrackId = activeTrackId;
        if (activeTrackId === trackId) {
          newActiveTrackId = undefined;
          setActiveTrackId(undefined);
        }

        saveToStorage(updatedTracks, newActiveTrackId);
        return updatedTracks;
      });
    },
    [activeTrackId, saveToStorage]
  );

  // Set the active subtitle track
  const setActiveSubtitleTrack = useCallback(
    (trackId?: string) => {
      setActiveTrackId(trackId);
      saveToStorage(subtitleTracks, trackId);
    },
    [subtitleTracks, saveToStorage]
  );

  // Update subtitle tracks (for compatibility)
  const updateSubtitleTracks = useCallback(
    (tracks: SubtitleTrack[]) => {
      setSubtitleTracks(tracks);
      saveToStorage(tracks, activeTrackId);
    },
    [activeTrackId, saveToStorage]
  );

  // Update both tracks and active track in one operation
  const updateSubtitleTracksAndActive = useCallback(
    (tracks: SubtitleTrack[], newActiveTrackId?: string) => {
      setSubtitleTracks(tracks);
      setActiveTrackId(newActiveTrackId);
      saveToStorage(tracks, newActiveTrackId);
    },
    [saveToStorage]
  );

  return {
    subtitleTracks,
    activeTrackId,
    addSubtitleTracks,
    removeSubtitleTrack,
    setActiveSubtitleTrack,
    updateSubtitleTracks,
    updateSubtitleTracksAndActive,
  };
}
