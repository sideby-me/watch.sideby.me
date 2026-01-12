'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Crown, Users, Lightbulb } from 'lucide-react';

interface HostControlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HostControlDialog({ open, onOpenChange }: HostControlDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center space-x-2 text-xl">
            <Lightbulb className="h-6 w-6 text-primary" />
            <span className="tracking-tight">Guest vs. Host</span>
          </DialogTitle>
          <DialogDescription className="text-sm tracking-tight">
            Here’s a quick breakdown of who can do what in the room.
          </DialogDescription>
        </DialogHeader>

        {/* Guests */}
        <ScrollArea className="flex-1 px-6 py-2">
          <div className="space-y-4 py-4">
            <div className="rounded-md bg-primary-50 p-3 sm:p-4">
              <h4 className="flex items-center gap-2 text-sm font-medium text-primary-900 sm:text-base">
                <Users className="h-4 w-4" />
                As a Guest, you can...
              </h4>
              <ul className="mt-2 space-y-1 text-xs tracking-tight text-primary-900 sm:text-sm">
                <li>• Gasp at the same moment in sync</li>
                <li>• Share your hot takes</li>
                <li>• Politely ask for the remote</li>
              </ul>
            </div>

            {/* Hosts */}
            <div className="rounded-md bg-success-100 sm:p-4">
              <h4 className="flex items-center gap-2 text-sm font-medium text-success-900 sm:text-base">
                <Crown className="h-4 w-4" />
                As a Host, you get all the power...
              </h4>
              <ul className="mt-2 space-y-1 text-xs tracking-tight text-success-900 sm:text-sm">
                <li>• You have the remote</li>
                <li>• Skip to the good parts</li>
                <li>• Set the rules of the room</li>
              </ul>
            </div>

            {/* Remote */}
            <div className="rounded-md bg-destructive-100 sm:p-4">
              <h4 className="text-sm font-medium text-destructive-900 sm:text-base">Want the remote?</h4>
              <p className="mt-1 text-xs tracking-tight text-destructive-900 sm:text-sm">
                {`Just ask someone who's already a host! They can promote you with the little crown (👑) next to your name.`}
              </p>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end border-t bg-black p-6">
          <Button onClick={() => onOpenChange(false)}>Makes sense</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
