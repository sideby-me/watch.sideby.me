'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Video } from 'lucide-react';

// Loading state display
interface LoadingDisplayProps {
  roomId: string;
}

export function LoadingDisplay({ roomId }: LoadingDisplayProps) {
  return (
    <div className="mx-auto mt-16 max-w-md">
      <Card>
        <CardContent className="flex flex-col items-center space-y-4 p-6 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary tracking-tight" />
          <h2 className="text-xl font-semibold">Joining Room</h2>
          <p className="text-muted-foreground">Finding a couch for {roomId}...</p>
        </CardContent>
      </Card>
    </div>
  );
}

// Error display
interface ErrorDisplayProps {
  error: string;
  onRetry: () => void;
}

export function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  return (
    <div className="mx-auto mt-16 max-w-md">
      <Card>
        <CardContent className="flex flex-col items-center space-y-4 p-6 text-center tracking-tight">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">A wild error appeared!</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={onRetry}>Try Again</Button>
        </CardContent>
      </Card>
    </div>
  );
}

// Sync error display
interface SyncErrorProps {
  error: string;
}

export function SyncError({ error }: SyncErrorProps) {
  return (
    <Card className="mb-6 border-destructive">
      <CardContent>
        <div className="flex items-center space-x-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm tracking-tight">{error}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// To let the user know about their guest status
interface GuestInfoBannerProps {
  onLearnMore: () => void;
  onDismiss: () => void;
}

export function GuestInfoBanner({ onLearnMore, onDismiss }: GuestInfoBannerProps) {
  return (
    <Card className="mb-6 border-primary bg-primary-50">
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-primary-900">
            <Video className="h-6 w-6" />
            <span className="font-medium">Just a heads-up: - only the host has the remote.</span>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="link" size="sm" onClick={onLearnMore} className="text-primary-900 hover:text-primary-800">
              What does this mean?
            </Button>
            <Button size="icon" onClick={onDismiss} className="bg-transparent text-primary-900">
              ✕
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
