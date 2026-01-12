'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2 } from 'lucide-react';
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

interface PasscodeDialogProps {
  open: boolean;
  roomId: string;
  error: string;
  isLoading: boolean;
  onSubmit: (passcode: string) => void;
  onCancel: () => void;
}

export function PasscodeDialog({ open, roomId, error, isLoading, onSubmit, onCancel }: PasscodeDialogProps) {
  const router = useRouter();
  const [passcode, setPasscode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPasscode('');
      // Focus input when dialog opens
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handlePasscodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setPasscode(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode.length === 4 && !isLoading) {
      onSubmit(passcode);
    }
  };

  const handleCancel = () => {
    onCancel();
    router.push('/join');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={isOpen => {
        if (!isOpen) handleCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="px-6 pt-6">
            {/* Playful title aligning with the "nerdy friend" persona */}
            <DialogTitle className="flex items-center gap-2 text-xl font-semibold tracking-tighter">
              <KeyRound className="h-5 w-5 text-primary" />
              Secret Passcode Required
            </DialogTitle>
            <DialogDescription className="text-sm tracking-tight text-neutral">
              Room <span className="font-mono font-bold text-foreground">{roomId}</span> is locked down. You&apos;ll
              need the 4-digit code to get past the bouncer.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-6">
            <div className="space-y-3">
              <Label htmlFor="passcode-input" className="text-sm font-bold tracking-tight">
                The Magic Numbers
              </Label>
              <Input
                ref={inputRef}
                id="passcode-input"
                type="text"
                inputMode="numeric"
                pattern="\d*"
                value={passcode}
                onChange={handlePasscodeChange}
                placeholder="••••"
                className="text-center font-mono text-2xl tracking-[0.5em]"
                maxLength={4}
                autoComplete="off"
                disabled={isLoading}
                aria-describedby={error ? 'passcode-error' : undefined}
              />
              {error && (
                <div id="passcode-error" className="text-sm font-medium text-red-500" role="alert">
                  {error}
                </div>
              )}
              {passcode.length > 0 && passcode.length < 4 && !error && (
                <p className="text-center text-xs text-muted-foreground">{4 - passcode.length} more to go...</p>
              )}
            </div>
          </div>

          <DialogFooter className="flex flex-shrink-0 justify-end gap-3 border-t bg-black px-6 py-4">
            <Button type="button" variant="ghost" onClick={handleCancel} disabled={isLoading}>
              Nevermind
            </Button>
            <Button type="submit" disabled={passcode.length !== 4 || isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking credentials...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Unlock Room
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
