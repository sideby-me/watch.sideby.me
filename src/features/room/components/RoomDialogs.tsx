'use client';

import { memo } from 'react';
import { HostControlDialog } from './HostControlDialog';
import { JoinRoomDialog } from './JoinRoomDialog';
import { PasscodeDialog } from './PasscodeDialog';
import { RoomSettingsDialog } from './RoomSettingsDialog';
import { RoomSettings } from '@/types';

interface RoomDialogsProps {
  roomId: string;
  roomSettings: RoomSettings | undefined;

  // Host control dialog
  showHostDialog: boolean;
  onHostDialogChange: (open: boolean) => void;

  // Join dialog
  showJoinDialog: boolean;
  onJoin: (userName: string) => void;
  onCancelJoin: () => void;

  // Passcode dialog
  showPasscodeDialog: boolean;
  passcodeError: string;
  isVerifyingPasscode: boolean;
  onVerifyPasscode: (passcode: string) => void;
  onCancelPasscode: () => void;

  // Settings dialog
  showSettingsDialog: boolean;
  onSettingsDialogChange: (open: boolean) => void;
  onUpdateSettings: (settings: Partial<RoomSettings>) => void;
}

export const RoomDialogs = memo(function RoomDialogs({
  roomId,
  roomSettings,
  showHostDialog,
  onHostDialogChange,
  showJoinDialog,
  onJoin,
  onCancelJoin,
  showPasscodeDialog,
  passcodeError,
  isVerifyingPasscode,
  onVerifyPasscode,
  onCancelPasscode,
  showSettingsDialog,
  onSettingsDialogChange,
  onUpdateSettings,
}: RoomDialogsProps) {
  return (
    <>
      <HostControlDialog open={showHostDialog} onOpenChange={onHostDialogChange} />

      <JoinRoomDialog open={showJoinDialog} roomId={roomId} onJoin={onJoin} onCancel={onCancelJoin} />

      <PasscodeDialog
        open={showPasscodeDialog}
        roomId={roomId}
        error={passcodeError}
        isLoading={isVerifyingPasscode}
        onSubmit={onVerifyPasscode}
        onCancel={onCancelPasscode}
      />

      <RoomSettingsDialog
        open={showSettingsDialog}
        onOpenChange={onSettingsDialogChange}
        settings={roomSettings}
        onUpdateSettings={onUpdateSettings}
      />
    </>
  );
});
