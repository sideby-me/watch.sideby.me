'use client';

import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { Room, User } from '@/types';
import { roomSessionStorage } from '@/lib/session-storage';

/**
 * Options for the room initialization hook.
 */
export interface UseRoomInitializationOptions {
  roomId: string;
  socket: Socket | null;
  isConnected: boolean;
  room: Room | null;
  currentUser: User | null;
  isJoining: boolean;
  hasAttemptedJoinRef: React.MutableRefObject<boolean>;
  // Callbacks
  emitJoinRoom: (userName: string, passcode?: string, hostToken?: string) => void;
  setIsJoining: (v: boolean) => void;
  setShowJoinDialog: (v: boolean) => void;
  setPendingUserName: (v: string) => void;
  // For initial video & autoplay
  initialVideoUrl: string | null;
  autoplayParam: string | null;
  initialVideoAppliedRef: React.MutableRefObject<boolean>;
  autoplayTriggeredRef: React.MutableRefObject<boolean>;
  handleSetVideo: (url: string) => void;
  getActivePlayer: () => { play?: () => void | Promise<void> } | null;
  handleVideoPlay: () => void;
}

/**
 * Hook that handles room initialization logic:
 * 1. Auto-join from session storage (creator data or join page data)
 * 2. Show join dialog if no stored data
 * 3. Apply initial video from query params (host only)
 * 4. Trigger autoplay if autoplay=1 param (host only)
 *
 * Internalizes join cooldown to prevent rapid re-attempts.
 */
export function useRoomInitialization(options: UseRoomInitializationOptions): void {
  const {
    roomId,
    socket,
    isConnected,
    room,
    currentUser,
    isJoining,
    hasAttemptedJoinRef,
    emitJoinRoom,
    setIsJoining,
    setShowJoinDialog,
    setPendingUserName,
    initialVideoUrl,
    autoplayParam,
    initialVideoAppliedRef,
    autoplayTriggeredRef,
    handleSetVideo,
    getActivePlayer,
    handleVideoPlay,
  } = options;

  // Internal join cooldown state
  const [lastJoinAttempt, setLastJoinAttempt] = useState<number>(0);

  // ─────────────────────────────────────────────────────────────────────────────
  // Effect 1: Auto-join logic
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !isConnected || !roomId) {
      return;
    }

    // Already joined
    if (room && currentUser) {
      return;
    }

    // Already in progress
    if (isJoining || hasAttemptedJoinRef.current) {
      return;
    }

    // Cooldown check (2 seconds)
    const now = Date.now();
    if (now - lastJoinAttempt < 2000) {
      return;
    }

    console.log('🚀 Starting room join process...');
    setIsJoining(true);
    setLastJoinAttempt(now);
    hasAttemptedJoinRef.current = true;

    // Check if this user is the room creator first
    const creatorData = roomSessionStorage.getRoomCreator(roomId);
    if (creatorData) {
      console.log('👑 Room creator detected, joining as host:', creatorData.hostName);
      roomSessionStorage.clearRoomCreator();
      emitJoinRoom(creatorData.hostName, undefined, creatorData.hostToken);
      return;
    }

    // Check if user came from join page
    const joinData = roomSessionStorage.getJoinData(roomId);
    if (joinData) {
      setPendingUserName(joinData.userName);
      roomSessionStorage.clearJoinData();
      console.log('👤 Joining with stored data:', joinData.userName);
      emitJoinRoom(joinData.userName);
      return;
    }

    // Show dialog for name if no stored data
    console.log('❓ No stored user data, showing join dialog');
    setShowJoinDialog(true);
  }, [
    socket,
    isConnected,
    roomId,
    room,
    currentUser,
    isJoining,
    hasAttemptedJoinRef,
    lastJoinAttempt,
    setIsJoining,
    emitJoinRoom,
    setPendingUserName,
    setShowJoinDialog,
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Effect 2: Apply initial video from query params (host only)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!room || !currentUser?.isHost) return;
    if (!initialVideoUrl || initialVideoAppliedRef.current) return;

    // Only apply if room doesn't already have a video
    if (!room.videoUrl) {
      handleSetVideo(initialVideoUrl);
      initialVideoAppliedRef.current = true;
    }
  }, [room, currentUser, initialVideoUrl, initialVideoAppliedRef, handleSetVideo]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Effect 3: Autoplay if autoplay=1 query param (host only)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!room || !currentUser?.isHost) return;
    if (autoplayTriggeredRef.current) return;
    if (autoplayParam !== '1') return;

    const hasVideo = !!room.videoUrl || !!room.videoMeta?.playbackUrl;
    if (!hasVideo) return;

    const player = getActivePlayer();
    if (!player) return;

    autoplayTriggeredRef.current = true;

    try {
      const maybePromise = player.play?.();
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise
          .then(() => {
            handleVideoPlay();
          })
          .catch(() => {
            // Autoplay blocked by browser
          });
      } else {
        handleVideoPlay();
      }
    } catch {
      // Ignore autoplay errors
    }
  }, [room, currentUser, autoplayParam, autoplayTriggeredRef, getActivePlayer, handleVideoPlay]);
}
