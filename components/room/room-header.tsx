'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, Check, Crown, Share } from 'lucide-react';

interface RoomHeaderProps {
  roomId: string;
  hostName: string;
  hostCount: number;
  isHost: boolean;
  showCopied: boolean;
  onCopyRoomId: () => void;
  onShareRoom: () => void;
}

export function RoomHeader({
  roomId,
  hostName,
  hostCount,
  isHost,
  showCopied,
  onCopyRoomId,
  onShareRoom,
}: RoomHeaderProps) {
  return (
    <Card className="mt-6 border-0">
      <CardHeader className="-px-6">
        {/* Room info */}
        <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 md:w-auto md:justify-start">
              <span className="break-all text-2xl font-semibold tracking-tighter sm:break-normal md:text-3xl">
                {`You're in: ${roomId}`}
              </span>
              {isHost && <Badge variant="default">Host</Badge>}
            </CardTitle>
            <div className="flex w-full justify-between gap-4 text-sm text-muted-foreground md:w-auto md:justify-start">
              <div className="flex items-center gap-2 text-primary-700">
                <Crown className="h-4 w-4 flex-shrink-0" />
                <span className="font-bold tracking-tight">by {hostName}</span>
              </div>
              <span className="tracking-tight text-neutral">
                {hostCount} host{hostCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Room actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="ghost" onClick={onCopyRoomId}>
              {showCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {showCopied ? 'Copied!' : 'Copy ID'}
            </Button>
            <Button variant="default" onClick={onShareRoom}>
              <Share className="mr-2 h-4 w-4" />
              Share
            </Button>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
