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
import { parseVideoUrl } from '@/lib/video-utils';
import { Video, Youtube, FileVideo, ExternalLink, ArrowRight, Link } from 'lucide-react';

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
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Video className="h-5 w-5" />
            <span>Now Playing</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
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
      <CardHeader>
        <CardTitle className="flex items-center space-x-4">
          <Video className="h-8 w-8" />
          <span className="text-3xl font-semibold tracking-tighter">Set Up Video</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
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
        <Label htmlFor="videoUrl" className="text-base font-bold tracking-tight">
          What are we watching?
        </Label>
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
