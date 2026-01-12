'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseNotificationSoundOptions {
  enabled?: boolean;
  volume?: number;
}

interface UseNotificationSoundReturn {
  enabled: boolean;
  volume: number;
  toggleEnabled: () => void;
  setVolume: (volume: number) => void;
  playNotification: () => void;
  isSupported: boolean;
}

export function useNotificationSound(options: UseNotificationSoundOptions = {}): UseNotificationSoundReturn {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('chat-notification-sound-enabled');
      return stored ? JSON.parse(stored) : (options.enabled ?? true);
    }
    return options.enabled ?? true;
  });

  const [volume, setVolumeState] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('chat-notification-sound-volume');
      return stored ? parseFloat(stored) : (options.volume ?? 0.5);
    }
    return options.volume ?? 0.5;
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const isSupported = useRef<boolean>(true);

  // Initialize audio context
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      // Use Web Audio API for better control and reliability
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        isSupported.current = false;
        return;
      }
      audioContextRef.current = new AudioContextClass();
    } catch (error) {
      console.warn('Audio context not supported:', error);
      isSupported.current = false;
    }

    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Save enabled state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chat-notification-sound-enabled', JSON.stringify(enabled));
    }
  }, [enabled]);

  // Save volume to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('chat-notification-sound-volume', volume.toString());
    }
  }, [volume]);

  const toggleEnabled = useCallback(() => {
    setEnabled(prev => {
      const newValue = !prev;
      // Play a confirmation sound when enabling
      if (newValue && isSupported.current && audioContextRef.current) {
        setTimeout(() => {
          if (audioContextRef.current) {
            try {
              const audioContext = audioContextRef.current;
              if (audioContext.state === 'suspended') {
                audioContext.resume();
              }

              // Quick confirmation beep
              const gainNode = audioContext.createGain();
              const oscillator = audioContext.createOscillator();

              oscillator.connect(gainNode);
              gainNode.connect(audioContext.destination);

              oscillator.type = 'sine';
              oscillator.frequency.setValueAtTime(600, audioContext.currentTime);

              gainNode.gain.setValueAtTime(0, audioContext.currentTime);
              gainNode.gain.linearRampToValueAtTime(volume * 0.05, audioContext.currentTime + 0.01);
              gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);

              oscillator.start(audioContext.currentTime);
              oscillator.stop(audioContext.currentTime + 0.1);
            } catch (error) {
              console.warn('Failed to play confirmation sound:', error);
            }
          }
        }, 100);
      }
      return newValue;
    });
  }, [volume]);

  const setVolume = useCallback((newVolume: number) => {
    setVolumeState(Math.max(0, Math.min(1, newVolume)));
  }, []);

  const playNotification = useCallback(() => {
    if (!enabled || !isSupported.current || !audioContextRef.current) return;

    try {
      const audioContext = audioContextRef.current;

      // Resume audio context if suspended (required for user interaction)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      // Create a pleasant notification sound using oscillators
      const gainNode = audioContext.createGain();
      const oscillator1 = audioContext.createOscillator();
      const oscillator2 = audioContext.createOscillator();

      // Connect nodes
      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Configure first tone (higher pitch)
      oscillator1.type = 'sine';
      oscillator1.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator1.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.1);

      // Configure second tone (lower pitch, slight delay)
      oscillator2.type = 'sine';
      oscillator2.frequency.setValueAtTime(500, audioContext.currentTime + 0.05);
      oscillator2.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.15);

      // Configure volume envelope
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume * 0.1, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);

      // Start and stop oscillators
      oscillator1.start(audioContext.currentTime);
      oscillator1.stop(audioContext.currentTime + 0.2);

      oscillator2.start(audioContext.currentTime + 0.05);
      oscillator2.stop(audioContext.currentTime + 0.25);
    } catch (error) {
      console.warn('Failed to play notification sound:', error);
    }
  }, [enabled, volume]);

  return {
    enabled,
    volume,
    toggleEnabled,
    setVolume,
    playNotification,
    isSupported: isSupported.current,
  };
}
