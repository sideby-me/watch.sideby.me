'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Socket } from 'socket.io-client';
import { roomSessionStorage } from '@/lib/session-storage';
import { logDebug } from '@/src/core/logger';

interface UseRoomUiStateOptions {
  roomId: string;
  socket: Socket | null;
  isConnected: boolean;
  pendingUserName: string;
  setPendingUserName: (name: string) => void;
  onJoinEmit: (userName: string, passcode?: string) => void;
}

interface UseRoomUiStateReturn {
  // UI State
  showGuestInfoBanner: boolean;
  showHostDialog: boolean;
  showCopied: boolean;
  showJoinDialog: boolean;
  showPasscodeDialog: boolean;
  passcodeError: string;
  isVerifyingPasscode: boolean;
  showSettingsDialog: boolean;

  // UI State Setters
  setShowGuestInfoBanner: (show: boolean) => void;
  setShowHostDialog: (show: boolean) => void;
  setShowCopied: (show: boolean) => void;
  setShowJoinDialog: (show: boolean) => void;
  setShowPasscodeDialog: (show: boolean) => void;
  setPasscodeError: (error: string) => void;
  setIsVerifyingPasscode: (verifying: boolean) => void;
  setShowSettingsDialog: (show: boolean) => void;

  // Actions
  handleJoinWithName: (userName: string) => void;
  handleCancelJoin: () => void;
  handleVerifyPasscode: (passcode: string) => void;
  handleCancelPasscode: () => void;
  copyRoomId: () => void;
  shareRoom: () => void;
  showGuestBannerTemporarily: () => void;
  resetPasscodeState: () => void;
}

export function useRoomUiState({
  roomId,
  socket,
  isConnected,
  pendingUserName,
  setPendingUserName,
  onJoinEmit,
}: UseRoomUiStateOptions): UseRoomUiStateReturn {
  const router = useRouter();

  // UI State
  const [showGuestInfoBanner, setShowGuestInfoBanner] = useState(false);
  const [showHostDialog, setShowHostDialog] = useState(false);
  const [showCopied, setShowCopied] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showPasscodeDialog, setShowPasscodeDialog] = useState(false);
  const [passcodeError, setPasscodeError] = useState('');
  const [isVerifyingPasscode, setIsVerifyingPasscode] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);

  // Show guest banner temporarily
  const showGuestBannerTemporarily = useCallback(() => {
    setShowGuestInfoBanner(true);
    setTimeout(() => setShowGuestInfoBanner(false), 5000);
  }, []);

  // Reset passcode state on successful join
  const resetPasscodeState = useCallback(() => {
    setShowPasscodeDialog(false);
    setPasscodeError('');
    setIsVerifyingPasscode(false);
    setPendingUserName('');
  }, [setPendingUserName]);

  // Handle join with name from dialog
  const handleJoinWithName = useCallback(
    (userName: string) => {
      if (!socket || !isConnected) return;

      logDebug('room', 'join_with_name', `Joining with dialog name: ${userName}`);
      setPendingUserName(userName);
      setShowJoinDialog(false);
      onJoinEmit(userName);
    },
    [socket, isConnected, setPendingUserName, onJoinEmit]
  );

  // Handle cancel join from dialog
  const handleCancelJoin = useCallback(() => {
    logDebug('room', 'join_cancel', 'Join cancelled, redirecting to join page');
    setShowJoinDialog(false);
    router.push('/join');
  }, [router]);

  // Passcode verification
  const handleVerifyPasscode = useCallback(
    (passcode: string) => {
      if (!socket || !isConnected) return;

      logDebug('room', 'passcode_verify', `Verifying passcode for room: ${roomId}`);
      setPasscodeError('');
      setIsVerifyingPasscode(true);

      // Get the pending user name from join dialog or session storage
      const joinData = roomSessionStorage.getJoinData(roomId);
      const userName = pendingUserName || joinData?.userName || '';

      if (!userName) {
        setPasscodeError('Please enter your name first.');
        setIsVerifyingPasscode(false);
        return;
      }

      onJoinEmit(userName, passcode);
    },
    [socket, isConnected, roomId, pendingUserName, onJoinEmit]
  );

  const handleCancelPasscode = useCallback(() => {
    logDebug('room', 'passcode_cancel', 'Passcode entry cancelled');
    setShowPasscodeDialog(false);
    setPasscodeError('');
    setIsVerifyingPasscode(false);
    setPendingUserName('');
    router.push('/join');
  }, [router, setPendingUserName]);

  const copyRoomId = useCallback(() => {
    navigator.clipboard.writeText(roomId);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  }, [roomId]);

  const shareRoom = useCallback(() => {
    const url = `${window.location.origin}/room/${roomId}`;
    if (navigator.share) {
      navigator.share({
        title: `You're invited! Yay?`,
        text: `Come watch this with me ;) Here's the room code: ${roomId}`,
        url,
      });
    } else {
      navigator.clipboard.writeText(url);
    }
  }, [roomId]);

  return {
    // UI State
    showGuestInfoBanner,
    showHostDialog,
    showCopied,
    showJoinDialog,
    showPasscodeDialog,
    passcodeError,
    isVerifyingPasscode,
    showSettingsDialog,

    // UI State Setters
    setShowGuestInfoBanner,
    setShowHostDialog,
    setShowCopied,
    setShowJoinDialog,
    setShowPasscodeDialog,
    setPasscodeError,
    setIsVerifyingPasscode,
    setShowSettingsDialog,

    // Actions
    handleJoinWithName,
    handleCancelJoin,
    handleVerifyPasscode,
    handleCancelPasscode,
    copyRoomId,
    shareRoom,
    showGuestBannerTemporarily,
    resetPasscodeState,
  };
}
