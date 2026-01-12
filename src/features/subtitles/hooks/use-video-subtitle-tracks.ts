'use client';

import { useEffect, useCallback } from 'react';
import type { SubtitleTrack } from '@/types/schemas';
import { logDebug } from '@/src/core/logger';

interface UseVideoSubtitleTracksOptions {
  videoElement: HTMLVideoElement | null;
  subtitleTracks: SubtitleTrack[];
  activeSubtitleTrack?: string;
}

interface UseVideoSubtitleTracksReturn {
  debugSubtitles: () => void;
}

export function useVideoSubtitleTracks({
  videoElement,
  subtitleTracks,
  activeSubtitleTrack,
}: UseVideoSubtitleTracksOptions): UseVideoSubtitleTracksReturn {
  // Handle subtitle tracks
  useEffect(() => {
    if (!videoElement) return;

    logDebug('subtitles', 'manage_tracks', 'Managing subtitle tracks', {
      subtitleTracks: subtitleTracks.length,
      activeTrack: activeSubtitleTrack,
      videoReadyState: videoElement.readyState,
    });

    // Remove existing subtitle track elements that we added
    const existingTracks = videoElement.querySelectorAll('track[data-subtitle-track]');
    existingTracks.forEach(track => track.remove());

    // If no subtitle tracks, just return
    if (subtitleTracks.length === 0) {
      logDebug('subtitles', 'manage_tracks', 'No subtitle tracks to add');
      return;
    }

    // Add new subtitle tracks
    subtitleTracks.forEach(subtitleTrack => {
      const trackElement = document.createElement('track');
      trackElement.kind = 'subtitles';
      trackElement.label = subtitleTrack.label;
      trackElement.srclang = subtitleTrack.language;
      trackElement.src = subtitleTrack.url;
      trackElement.setAttribute('data-subtitle-track', subtitleTrack.id);

      // Set default for the active track
      if (subtitleTrack.id === activeSubtitleTrack) {
        trackElement.default = true;
      }

      videoElement.appendChild(trackElement);
      logDebug(
        'subtitles',
        'track_added',
        `Added subtitle track: ${subtitleTrack.label} (${subtitleTrack.id}) - URL: ${subtitleTrack.url.substring(0, 50)}...`
      );
    });

    // Function to set up text tracks
    const setupTextTracks = () => {
      logDebug('subtitles', 'setup_tracks', 'Setting up text tracks...', {
        totalTracks: videoElement.textTracks.length,
        activeTrack: activeSubtitleTrack,
      });

      // Disable all text tracks first
      for (let i = 0; i < videoElement.textTracks.length; i++) {
        const track = videoElement.textTracks[i];
        track.mode = 'disabled';
        logDebug(
          'subtitles',
          'track_disabled',
          `Disabled track ${i}: ${track.label} (${track.language}) - kind: ${track.kind}`
        );
      }

      // Enable the active track if specified
      if (activeSubtitleTrack) {
        const trackElements = videoElement.querySelectorAll('track[data-subtitle-track]');

        // Find the track element with matching ID
        for (let i = 0; i < trackElements.length; i++) {
          const trackElement = trackElements[i];
          const trackId = trackElement.getAttribute('data-subtitle-track');

          if (trackId === activeSubtitleTrack) {
            // Find the corresponding text track by matching label
            const trackLabel = trackElement.getAttribute('label');

            logDebug('subtitles', 'track_search', `Looking for TextTrack matching: label="${trackLabel}"`);

            // Search through all text tracks to find the matching one
            for (let j = 0; j < videoElement.textTracks.length; j++) {
              const textTrack = videoElement.textTracks[j];

              // Try to match by label and kind
              if (textTrack.label === trackLabel && textTrack.kind === 'subtitles') {
                textTrack.mode = 'showing';
                logDebug(
                  'subtitles',
                  'track_enabled',
                  `Enabled subtitle track: ${textTrack.label} (${trackId}) - mode: ${textTrack.mode}`
                );

                // Add event listeners for debugging
                const handleLoad = () => {
                  logDebug('subtitles', 'track_loaded', `Subtitle track loaded: ${textTrack.label}`);
                  // Force re-enable the track after load
                  if (textTrack.mode !== 'showing') {
                    textTrack.mode = 'showing';
                    logDebug('subtitles', 'track_reenabled', `Re-enabled track after load: ${textTrack.label}`);
                  }
                };

                const handleError = (e: Event) => {
                  logDebug('subtitles', 'track_load_err', `Subtitle track failed to load: ${textTrack.label}`, {
                    error: String(e),
                  });
                };

                trackElement.addEventListener('load', handleLoad);
                trackElement.addEventListener('error', handleError);

                break;
              }
            }
            break;
          }
        }
      }

      // If no tracks were found or enabled, try a fallback approach
      if (activeSubtitleTrack && videoElement.textTracks.length > 0) {
        setTimeout(() => {
          logDebug('subtitles', 'fallback_check', 'Re-checking subtitle tracks after delay...');
          let foundTrack = false;

          for (let i = 0; i < videoElement.textTracks.length; i++) {
            const track = videoElement.textTracks[i];
            if (track.mode === 'showing') {
              foundTrack = true;
              logDebug('subtitles', 'fallback_found', `Confirmed active track: ${track.label}`);
              break;
            }
          }

          if (!foundTrack) {
            logDebug(
              'subtitles',
              'fallback_activate',
              'No active tracks found, trying to enable the first subtitle track...'
            );
            for (let i = 0; i < videoElement.textTracks.length; i++) {
              const track = videoElement.textTracks[i];
              if (track.kind === 'subtitles') {
                track.mode = 'showing';
                logDebug('subtitles', 'fallback_activate_first', `Force-enabled first subtitle track: ${track.label}`);
                break;
              }
            }
          }
        }, 500);
      }
    };

    // Set up tracks immediately if video is ready, otherwise wait for loadeddata
    if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      logDebug('subtitles', 'video_ready', 'Video already loaded, setting up tracks immediately');
      setupTextTracks();
    } else {
      logDebug('subtitles', 'video_waiting', 'Video not ready, waiting for loadeddata event');
      const handleLoadedData = () => {
        logDebug('subtitles', 'video_loaded', 'Video loadeddata event fired, setting up tracks');
        setupTextTracks();
      };

      videoElement.addEventListener('loadeddata', handleLoadedData, { once: true });

      return () => {
        videoElement.removeEventListener('loadeddata', handleLoadedData);
      };
    }
  }, [videoElement, subtitleTracks, activeSubtitleTrack]);

  // Debug function
  const debugSubtitles = useCallback(() => {
    if (!videoElement) {
      logDebug('subtitles', 'debug', 'No video element');
      return;
    }

    logDebug('subtitles', 'debug', '=== SUBTITLE DEBUG INFO ===', {
      videoReadyState: videoElement.readyState,
      totalTextTracks: videoElement.textTracks.length,
    });

    for (let i = 0; i < videoElement.textTracks.length; i++) {
      const track = videoElement.textTracks[i];
      logDebug('subtitles', 'debug', `Track ${i}`, {
        label: track.label,
        language: track.language,
        kind: track.kind,
        mode: track.mode,
        cues: track.cues?.length || 0,
      });
    }

    const trackElements = videoElement.querySelectorAll('track[data-subtitle-track]');
    logDebug('subtitles', 'debug', `Track elements: ${trackElements.length}`);
    trackElements.forEach((el, i) => {
      logDebug('subtitles', 'debug', `Element ${i}`, {
        src: el.getAttribute('src'),
        label: el.getAttribute('label'),
        id: el.getAttribute('data-subtitle-track'),
        default: el.hasAttribute('default'),
      });
    });

    logDebug('subtitles', 'debug', 'Active subtitle track prop', { activeSubtitleTrack });
    logDebug('subtitles', 'debug', '========================');
  }, [videoElement, activeSubtitleTrack]);

  return {
    debugSubtitles,
  };
}
