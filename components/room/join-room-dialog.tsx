'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AtSign, Users, Dices } from 'lucide-react';
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
import { generateQuirkyName } from '@/lib/name-generator';

interface JoinRoomDialogProps {
  open: boolean;
  roomId: string;
  onJoin: (userName: string) => void;
  onCancel: () => void;
}

export function JoinRoomDialog({ open, roomId, onJoin, onCancel }: JoinRoomDialogProps) {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [error, setError] = useState('');
  const [placeholder, setPlaceholder] = useState('e.g., Silly Penguin');

  const handleGenerateName = useCallback(() => {
    const name = generateQuirkyName();
    setUserName(name);
    setPlaceholder(`e.g., ${name}`);
  }, []);

  useEffect(() => {
    if (open) {
      setPlaceholder(`e.g., ${generateQuirkyName()}`);
      setUserName('');
      setError('');
    }
  }, [open]);

  const validateAndJoin = useCallback(() => {
    const trimmedName = userName.trim();

    if (!trimmedName) {
      setError('Please enter your callsign');
      return;
    }

    if (trimmedName.length < 2) {
      setError("Hmm, that name's a little brief. We need a callsign that's at least 2 characters long.");
      return;
    }

    if (trimmedName.length > 20) {
      setError('Whoa, what an epic name! Sadly, our little callsign tags can only fit 20 characters.');
      return;
    }

    if (!/^[a-zA-Z0-9\s\-_.!?]+$/.test(trimmedName)) {
      setError('Easy on the fancy characters! Our system is a bit sensitive with those special characters.');
      return;
    }

    setError('');
    onJoin(trimmedName);
  }, [userName, onJoin]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    validateAndJoin();
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
          <DialogHeader className="flex-shrink-0 px-6 pt-6">
            <DialogTitle className="flex items-center space-x-2 text-base sm:text-lg">
              <Users className="h-5 w-5 text-primary" />
              <span className="text-xl font-semibold tracking-tighter">Join Room {roomId}</span>
            </DialogTitle>
            <DialogDescription className="text-sm tracking-tight text-neutral">
              Enter your callsign to join the watch party.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4">
            <div className="w-full space-y-2">
              <Label htmlFor="joinDialogUserName" className="text-sm font-bold tracking-tight sm:text-base">
                Your Callsign
              </Label>
              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-neutral" />
                  <Input
                    id="joinDialogUserName"
                    name="userName"
                    type="text"
                    value={userName}
                    onChange={e => setUserName(e.target.value)}
                    placeholder={placeholder}
                    className="pl-10 text-base tracking-tight sm:text-lg"
                    maxLength={50}
                    autoFocus
                    aria-describedby={error ? 'join-dialog-error' : undefined}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleGenerateName}
                  title="Generate random name"
                  className="shrink-0"
                >
                  <Dices className="h-4 w-4" />
                </Button>
              </div>
              {error && (
                <div id="join-dialog-error" className="text-sm font-medium text-red-500" role="alert">
                  {error}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4 flex flex-shrink-0 justify-end gap-3 border-t bg-black px-6 py-4">
            <Button type="button" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!userName.trim()}>
              <Users className="mr-2 h-4 w-4" />
              Join Room
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
