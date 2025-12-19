'use client';

import { useState, useEffect } from 'react';
import { Settings, Lock, KeyRound, MessageSquareLock, X, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { RoomSettings } from '@/types';

interface RoomSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: RoomSettings | undefined;
  onUpdateSettings: (settings: Partial<RoomSettings>) => void;
}

export function RoomSettingsDialog({ open, onOpenChange, settings, onUpdateSettings }: RoomSettingsDialogProps) {
  const [isLocked, setIsLocked] = useState(settings?.isLocked ?? false);
  const [passcode, setPasscode] = useState(settings?.passcode ?? '');
  const [isChatLocked, setIsChatLocked] = useState(settings?.isChatLocked ?? false);
  const [hasChanges, setHasChanges] = useState(false);

  // Reset local state when dialog opens or settings change
  useEffect(() => {
    if (open) {
      setIsLocked(settings?.isLocked ?? false);
      setPasscode(settings?.passcode ?? '');
      setIsChatLocked(settings?.isChatLocked ?? false);
      setHasChanges(false);
    }
  }, [open, settings]);

  // Track changes
  useEffect(() => {
    const originalIsLocked = settings?.isLocked ?? false;
    const originalPasscode = settings?.passcode ?? '';
    const originalIsChatLocked = settings?.isChatLocked ?? false;

    const changed =
      isLocked !== originalIsLocked || passcode !== originalPasscode || isChatLocked !== originalIsChatLocked;

    setHasChanges(changed);
  }, [isLocked, passcode, isChatLocked, settings]);

  const handlePasscodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setPasscode(value);
  };

  const handleClearPasscode = () => {
    setPasscode('');
  };

  const handleSave = () => {
    onUpdateSettings({
      isLocked,
      passcode: passcode.length === 4 ? passcode : null,
      isChatLocked,
    });
    onOpenChange(false);
  };

  const isPasscodeValid = passcode.length === 0 || passcode.length === 4;

  const SettingItem = ({
    id,
    icon: Icon,
    label,
    description,
    checked,
    onCheckedChange,
  }: {
    id: string;
    icon: typeof Lock;
    label: string;
    description: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <div
      className={`flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors ${
        checked ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`rounded-md p-2 ${checked ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-0.5">
          <Label htmlFor={id} className="cursor-pointer text-sm font-semibold tracking-tight">
            {label}
          </Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium ${checked ? 'text-primary' : 'text-muted-foreground'}`}>
          {checked ? 'ON' : 'OFF'}
        </span>
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold tracking-tighter">
            <Settings className="h-5 w-5 text-primary" />
            Room Controls
          </DialogTitle>
          <DialogDescription className="text-sm tracking-tight text-neutral">
            You&apos;re the bouncer now. Decide who gets in and who speaks up.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          {/* Room Lock */}
          <SettingItem
            id="room-lock"
            icon={Lock}
            label="Lock Room"
            description="The doors are shut. No new guests allowed."
            checked={isLocked}
            onCheckedChange={setIsLocked}
          />

          {/* Room Passcode */}
          <div
            className={`rounded-lg border p-4 transition-colors ${
              passcode.length === 4 ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`rounded-md p-2 ${passcode.length === 4 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}
              >
                <KeyRound className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-3">
                <div className="space-y-0.5">
                  <Label htmlFor="room-passcode" className="text-sm font-semibold tracking-tight">
                    Secret Passcode
                  </Label>
                  <p className="text-xs text-muted-foreground">Set a 4-digit code to keep out the randoms</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="room-passcode"
                    type="text"
                    inputMode="numeric"
                    pattern="\d*"
                    value={passcode}
                    onChange={handlePasscodeChange}
                    placeholder="• • • •"
                    className="text-center font-mono text-lg tracking-[0.5em]"
                    maxLength={4}
                  />
                  {passcode && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleClearPasscode}
                      className="h-8 w-8 flex-shrink-0"
                      title="Clear passcode"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {passcode.length > 0 && passcode.length < 4 && (
                  <p className="text-xs text-destructive">
                    Need {4 - passcode.length} more digit{4 - passcode.length !== 1 ? 's' : ''} to be secure
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Chat Lock */}
          <SettingItem
            id="chat-lock"
            icon={MessageSquareLock}
            label="Lock Chat"
            description="Only hosts can chat or join voice/video"
            checked={isChatLocked}
            onCheckedChange={setIsChatLocked}
          />

          {/* Priority Note */}
          {isLocked && passcode.length === 4 && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive-100 bg-destructive-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive-800" />
              <p className="text-xs text-destructive-800">
                <strong>Heads up:</strong> &quot;Total Lockdown&quot; overrides the passcode. Nobody gets in, not even
                with the secret passcode.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-shrink-0 justify-end gap-3 border-t bg-card/50 px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Nevermind
          </Button>
          <Button type="button" onClick={handleSave} disabled={!hasChanges || !isPasscodeValid}>
            Update Security
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
