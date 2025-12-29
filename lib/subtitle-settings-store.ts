'use client';

import { useSyncExternalStore, useCallback } from 'react';

// Snap points for sliders
export const FONT_SIZE_SNAPS = [50, 75, 100, 125, 150, 175];
export const VERTICAL_POSITION_SNAPS = [5, 10, 15, 20, 25];
export const SYNC_OFFSET_STEP = 0.5;
export const SYNC_OFFSET_MIN = -10;
export const SYNC_OFFSET_MAX = 10;

export interface SubtitleSettings {
  fontSize: number;
  verticalPosition: number;
  syncOffset: number;
  backgroundBlur: boolean;
  backgroundFill: boolean;
  isBold: boolean;
}

const DEFAULT_SETTINGS: SubtitleSettings = {
  fontSize: 100,
  verticalPosition: 10,
  syncOffset: 0,
  backgroundBlur: true,
  backgroundFill: true,
  isBold: false,
};

const STORAGE_KEY = 'subtitle_settings';

// Module-level state (singleton)
let settings: SubtitleSettings = DEFAULT_SETTINGS;
let listeners = new Set<() => void>();
let isHydrated = false;

// Load from localStorage on module init (client-side only)
if (typeof window !== 'undefined') {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<SubtitleSettings>;
      settings = { ...DEFAULT_SETTINGS, ...parsed };
    }
    isHydrated = true;
  } catch (error) {
    console.error('Failed to load subtitle settings from localStorage:', error);
  }
}

// Notify all subscribers
function emitChange() {
  listeners.forEach(listener => listener());
}

// Save to localStorage
function persist() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save subtitle settings to localStorage:', error);
  }
}

// Store actions
function setFontSize(value: number) {
  settings = { ...settings, fontSize: Math.max(50, Math.min(175, value)) };
  persist();
  emitChange();
}

function setVerticalPosition(value: number) {
  settings = { ...settings, verticalPosition: Math.max(5, Math.min(25, value)) };
  persist();
  emitChange();
}

function setSyncOffset(value: number) {
  settings = { ...settings, syncOffset: Math.max(-10, Math.min(10, value)) };
  persist();
  emitChange();
}

function setBackgroundBlur(value: boolean) {
  settings = { ...settings, backgroundBlur: value };
  persist();
  emitChange();
}

function setBackgroundFill(value: boolean) {
  settings = { ...settings, backgroundFill: value };
  persist();
  emitChange();
}

function setIsBold(value: boolean) {
  settings = { ...settings, isBold: value };
  persist();
  emitChange();
}

function resetToDefaults() {
  settings = DEFAULT_SETTINGS;
  persist();
  emitChange();
}

// Subscribe/unsubscribe for useSyncExternalStore
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return settings;
}

function getServerSnapshot() {
  return DEFAULT_SETTINGS;
}

export function useSubtitleSettings() {
  const currentSettings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    settings: currentSettings,
    setFontSize: useCallback((v: number) => setFontSize(v), []),
    setVerticalPosition: useCallback((v: number) => setVerticalPosition(v), []),
    setSyncOffset: useCallback((v: number) => setSyncOffset(v), []),
    setBackgroundBlur: useCallback((v: boolean) => setBackgroundBlur(v), []),
    setBackgroundFill: useCallback((v: boolean) => setBackgroundFill(v), []),
    setIsBold: useCallback((v: boolean) => setIsBold(v), []),
    resetToDefaults: useCallback(() => resetToDefaults(), []),
  };
}
