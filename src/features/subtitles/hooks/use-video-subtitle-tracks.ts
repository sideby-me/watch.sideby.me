'use client';

import { useEffect, useCallback } from 'react';
import type { SubtitleTrack } from '@/types/schemas';

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

    console.log('Managing subtitle tracks:', {
      subtitleTracks: subtitleTracks.length,
      activeTrack: activeSubtitleTrack,
      videoReadyState: videoElement.readyState,
    });

    // Remove existing subtitle track elements that we added
    const existingTracks = videoElement.querySelectorAll('track[data-subtitle-track]');
    existingTracks.forEach(track => track.remove());

    // If no subtitle tracks, just return
    if (subtitleTracks.length === 0) {
      console.log('No subtitle tracks to add');
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
      console.log(
        `Added subtitle track: ${subtitleTrack.label} (${subtitleTrack.id}) - URL: ${subtitleTrack.url.substring(0, 50)}...`
      );
    });

    // Function to set up text tracks
    const setupTextTracks = () => {
      console.log('Setting up text tracks...', {
        totalTracks: videoElement.textTracks.length,
        activeTrack: activeSubtitleTrack,
      });

      // Disable all text tracks first
      for (let i = 0; i < videoElement.textTracks.length; i++) {
        const track = videoElement.textTracks[i];
        track.mode = 'disabled';
        console.log(`Disabled track ${i}: ${track.label} (${track.language}) - kind: ${track.kind}`);
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

            console.log(`Looking for TextTrack matching: label="${trackLabel}"`);

            // Search through all text tracks to find the matching one
            for (let j = 0; j < videoElement.textTracks.length; j++) {
              const textTrack = videoElement.textTracks[j];

              // Try to match by label and kind
              if (textTrack.label === trackLabel && textTrack.kind === 'subtitles') {
                textTrack.mode = 'showing';
                console.log(`✅ Enabled subtitle track: ${textTrack.label} (${trackId}) - mode: ${textTrack.mode}`);

                // Add event listeners for debugging
                const handleLoad = () => {
                  console.log(`📁 Subtitle track loaded: ${textTrack.label}`);
                  // Force re-enable the track after load
                  if (textTrack.mode !== 'showing') {
                    textTrack.mode = 'showing';
                    console.log(`🔄 Re-enabled track after load: ${textTrack.label}`);
                  }
                };

                const handleError = (e: Event) => {
                  console.error(`❌ Subtitle track failed to load: ${textTrack.label}`, e);
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
          console.log('🔄 Fallback: Re-checking subtitle tracks after delay...');
          let foundTrack = false;

          for (let i = 0; i < videoElement.textTracks.length; i++) {
            const track = videoElement.textTracks[i];
            if (track.mode === 'showing') {
              foundTrack = true;
              console.log(`✅ Confirmed active track: ${track.label}`);
              break;
            }
          }

          if (!foundTrack) {
            console.log('⚠️ No active tracks found, trying to enable the first subtitle track...');
            for (let i = 0; i < videoElement.textTracks.length; i++) {
              const track = videoElement.textTracks[i];
              if (track.kind === 'subtitles') {
                track.mode = 'showing';
                console.log(`🔄 Force-enabled first subtitle track: ${track.label}`);
                break;
              }
            }
          }
        }, 500);
      }
    };

    // Set up tracks immediately if video is ready, otherwise wait for loadeddata
    if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      console.log('Video already loaded, setting up tracks immediately');
      setupTextTracks();
    } else {
      console.log('Video not ready, waiting for loadeddata event');
      const handleLoadedData = () => {
        console.log('Video loadeddata event fired, setting up tracks');
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
      console.log('No video element');
      return;
    }

    console.log('=== SUBTITLE DEBUG INFO ===');
    console.log('Video ready state:', videoElement.readyState);
    console.log('Total text tracks:', videoElement.textTracks.length);

    for (let i = 0; i < videoElement.textTracks.length; i++) {
      const track = videoElement.textTracks[i];
      console.log(`Track ${i}:`, {
        label: track.label,
        language: track.language,
        kind: track.kind,
        mode: track.mode,
        cues: track.cues?.length || 0,
      });
    }

    const trackElements = videoElement.querySelectorAll('track[data-subtitle-track]');
    console.log('Track elements:', trackElements.length);
    trackElements.forEach((el, i) => {
      console.log(`Element ${i}:`, {
        src: el.getAttribute('src'),
        label: el.getAttribute('label'),
        id: el.getAttribute('data-subtitle-track'),
        default: el.hasAttribute('default'),
      });
    });

    console.log('Active subtitle track prop:', activeSubtitleTrack);
    console.log('========================');
  }, [videoElement, activeSubtitleTrack]);

  return {
    debugSubtitles,
  };
}
