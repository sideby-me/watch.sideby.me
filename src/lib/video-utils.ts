import { VideoType } from '@/types';
import { logVideo } from '@/src/core/logger/client-logger';

type ParsedVideo = { type: VideoType | 'unknown'; embedUrl: string };

const DRM_HOSTNAMES = new Set([
  'netflix.com', 'www.netflix.com',
  'disneyplus.com', 'www.disneyplus.com',
  'hulu.com', 'www.hulu.com',
  'primevideo.com', 'www.primevideo.com',
  'tv.apple.com',
  'play.max.com',
  'www.peacocktv.com',
  'www.paramountplus.com',
]);

export function isDrmHost(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return DRM_HOSTNAMES.has(hostname) || [...DRM_HOSTNAMES].some(h => hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function parseVideoUrl(url: string): ParsedVideo | null {
  try {
    const urlObj = new URL(url);

    // Only allow http/https; everything else is invalid
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return null;
    }

    // YouTube URLs
    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
      let videoId = '';

      if (urlObj.hostname.includes('youtu.be')) {
        videoId = urlObj.pathname.slice(1);
      } else if (urlObj.hostname.includes('youtube.com')) {
        videoId = urlObj.searchParams.get('v') || '';
      }

      if (videoId) {
        return {
          type: 'youtube',
          embedUrl: `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${window.location.origin}`,
        };
      }
    }

    return { type: 'unknown', embedUrl: url };
  } catch (error) {
    logVideo('parse_error', 'Error parsing video URL', { error: error instanceof Error ? error.message : error });
    return null;
  }
}

export function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function calculateCurrentTime(
  videoState: {
    currentTime: number;
    isPlaying: boolean;
    lastUpdateTime: number;
  },
  clockOffset: number = 0
): number {
  if (!videoState.isPlaying) {
    return videoState.currentTime;
  }

  const serverNow = Date.now() + clockOffset;
  const timeDiff = (serverNow - videoState.lastUpdateTime) / 1000;
  return videoState.currentTime + timeDiff;
}

// Gets supported video formats for the current browser
export function getSupportedVideoFormats(): Record<string, boolean> {
  const video = document.createElement('video');

  return {
    mp4: !!video.canPlayType('video/mp4'),
    webm: !!video.canPlayType('video/webm'),
    ogg: !!video.canPlayType('video/ogg'),
    mov: !!video.canPlayType('video/quicktime'),
    hls: !!video.canPlayType('application/vnd.apple.mpegurl') || !!video.canPlayType('application/x-mpegURL'),
  };
}
