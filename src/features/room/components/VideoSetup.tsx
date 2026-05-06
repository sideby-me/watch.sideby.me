'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { parseVideoUrl, isDrmHost } from '@/src/lib/video-utils';
import { Video, Youtube, FileVideo, ExternalLink, ArrowRight, Link } from 'lucide-react';

function ChromeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z" />
    </svg>
  );
}

interface VideoSetupProps {
  onVideoSet: (url: string) => void;
  isHost: boolean;
  hasVideo: boolean;
  videoUrl?: string;
}

export function VideoSetup({ onVideoSet, isHost, hasVideo, videoUrl }: VideoSetupProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      setError('Hello? you forgot the link??!?');
      return;
    }

    const parsed = parseVideoUrl(url.trim());
    if (!parsed) {
      setError(
        `Hmm, that link doesn't look right. We can handle a public http/https video link (YouTube, HLS, MP4, or similar).`
      );
      return;
    }

    if (isDrmHost(url.trim())) {
      setError(`That stream is heavily encrypted with DRM. We're good, but we're not "crack Disney's mainframe" good.`);
      return;
    }

    onVideoSet(url.trim());
    setUrl('');
    setError('');
    setIsDialogOpen(false);
  };

  const getVideoType = (url: string) => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return 'YouTube';
    }
    return 'Video File';
  };

  const getVideoIcon = (url: string) => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return <Youtube className="h-4 w-4 text-red-500" />;
    }
    return <FileVideo className="h-4 w-4 text-blue-500" />;
  };

  // Probably won't be very useful, but just in case
  if (hasVideo && videoUrl) {
    return (
      <Card>
        <CardHeader className="-px-6">
          <CardTitle className="flex items-center space-x-2">
            <Video className="h-5 w-5" />
            <span>Now Playing</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="-px-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-3 rounded-lg bg-muted p-3">
              {getVideoIcon(videoUrl)}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{getVideoType(videoUrl)}</div>
                <div className="truncate text-xs text-muted-foreground">{videoUrl}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => window.open(videoUrl, '_blank')}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>

            {isHost && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    Change Video
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Change Video</DialogTitle>
                    <DialogDescription>
                      Found something better? Drop in a new link to instantly change the video for everyone in the room.
                    </DialogDescription>
                  </DialogHeader>
                  <VideoUrlForm url={url} setUrl={setUrl} error={error} onSubmit={handleSubmit} />
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // For the guests
  if (!isHost) {
    return (
      <Card className="flex h-full flex-col justify-center border-0">
        <CardHeader className="text-center">
          <Video className="mx-auto mb-2 h-12 w-12 text-muted-foreground" />
          <CardTitle className="pb-2">The host is choosing a video</CardTitle>
          <CardDescription>Just hang tight! The host is taking a moment.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // For the hosts
  return (
    <Card className="flex h-full flex-col justify-center border-0">
      <CardHeader className="-px-6">
        <CardTitle className="flex items-center space-x-4">
          <Video className="h-8 w-8" />
          <span className="text-3xl font-semibold tracking-tighter">Set Up Video</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="-px-6">
        <VideoUrlForm url={url} setUrl={setUrl} error={error} onSubmit={handleSubmit} />
      </CardContent>
    </Card>
  );
}

function VideoUrlForm({
  url,
  setUrl,
  error,
  onSubmit,
}: {
  url: string;
  setUrl: (url: string) => void;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="videoUrl" className="text-base font-bold tracking-tight">
            What are we watching?
          </Label>
          <a
            href="https://pass.sideby.me"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-accent px-2.5 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
          >
            <ChromeIcon className="h-2.5 w-2.5" />
            <span>Get the extension</span>
          </a>
        </div>
        <div className="relative">
          <Link className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-neutral" />
          <Input
            id="videoUrl"
            placeholder="Paste a YouTube, MP4, or M3U8 or any video link..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            className="p-6 pl-10 !text-base"
          />
        </div>

        {error && <div className="rounded-md text-sm text-destructive">{error}</div>}
      </div>

      <Button type="submit" variant="secondary" className="w-full py-6 text-lg">
        Stream
        <ArrowRight className="!h-6 !w-6 text-lg text-primary" />
      </Button>
    </form>
  );
}
