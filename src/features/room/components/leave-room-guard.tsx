'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Socket } from 'socket.io-client';
import { SocketEvents, Room } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

interface LeaveRoomGuardProps {
  roomId: string;
  room: Room | null;
  socket: Socket<SocketEvents, SocketEvents> | null;
}

type PendingNavigation = string | 'back' | null;

export function LeaveRoomGuard({ roomId, room, socket }: LeaveRoomGuardProps) {
  const router = useRouter();
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const navigationGuardEnabledRef = useRef(true);

  const requestLeaveConfirmation = useCallback((target?: PendingNavigation) => {
    setPendingNavigation(target ?? '/');
    setLeaveDialogOpen(true);
  }, []);

  const handleConfirmLeave = useCallback(() => {
    navigationGuardEnabledRef.current = false;

    if (socket && room) {
      socket.emit('leave-room', { roomId });
    }

    setLeaveDialogOpen(false);

    if (pendingNavigation === 'back') {
      window.history.back();
      return;
    }

    const destination = pendingNavigation || '/';
    router.push(destination);
  }, [pendingNavigation, room, roomId, router, socket]);

  const handleStay = useCallback(() => {
    setLeaveDialogOpen(false);
    setPendingNavigation(null);
  }, []);

  useEffect(() => {
    if (!room) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!navigationGuardEnabledRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [room]);

  useEffect(() => {
    if (!room) return;

    const pushGuardState = () => {
      try {
        window.history.pushState({ ...window.history.state, __roomGuard: true }, '', window.location.href);
      } catch (error) {
        console.warn('Unable to push history guard state', error);
      }
    };

    pushGuardState();

    const handlePopState = (event: PopStateEvent) => {
      if (!navigationGuardEnabledRef.current) return;
      event.preventDefault();
      requestLeaveConfirmation('back');
      pushGuardState();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [requestLeaveConfirmation, room]);

  useEffect(() => {
    if (!room) return;

    const handleAnchorClick = (event: MouseEvent) => {
      if (!navigationGuardEnabledRef.current) return;
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

      const target = (event.target as HTMLElement | null)?.closest('a[href]');
      if (!target) return;

      const href = target.getAttribute('href');
      if (!href) return;
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash === window.location.hash
      )
        return;
      if (url.pathname.startsWith(`/room/${roomId}`)) return;

      event.preventDefault();
      requestLeaveConfirmation(url.pathname + url.search + url.hash);
    };

    document.addEventListener('click', handleAnchorClick, true);
    return () => document.removeEventListener('click', handleAnchorClick, true);
  }, [requestLeaveConfirmation, room, roomId]);

  return (
    <Dialog
      open={leaveDialogOpen}
      onOpenChange={open => {
        if (!open) handleStay();
      }}
    >
      <DialogContent>
        <DialogHeader className="flex-shrink-0 px-6 pt-6">
          <DialogTitle className="flex items-center space-x-2 text-base sm:text-lg">
            <LogOut className="h-5 w-5 text-primary" />
            <span className="text-xl font-semibold tracking-tighter">Heading out already?</span>
          </DialogTitle>
          <DialogDescription className="text-sm tracking-tight text-neutral">
            {`You're about to disconnect from the party. If you leave, you'll miss the best part (probably).`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex flex-shrink-0 justify-end gap-3 border-t bg-black px-6 py-4">
          <Button variant="ghost" onClick={handleStay}>
            False alarm
          </Button>
          <Button variant="destructive" onClick={handleConfirmLeave}>
            Leave room
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
