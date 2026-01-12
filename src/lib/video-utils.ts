import { VideoType } from '@/types';

type ParsedVideo = { type: VideoType | 'unknown'; embedUrl: string };

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

    const pathname = urlObj.pathname.toLowerCase();
    const search = urlObj.search.toLowerCase();

    const looksLikeHls =
      /\.m3u8(\?.*)?$/i.test(pathname) ||
      pathname.includes('/hls/') ||
      pathname.includes('master.m3u8') ||
      pathname.includes('manifest.m3u8') ||
      pathname.includes('/live/');
    if (looksLikeHls) {
      return {
        type: 'm3u8',
        embedUrl: url,
      };
    }

    // Direct video URLs (MP4, WebM, etc.)
    if (/\.(mp4|webm|ogg|mov|avi|mkv)(\?.*)?$/i.test(pathname)) {
      const isLikelyVideo =
        pathname.includes('/video') ||
        pathname.includes('/videos') ||
        pathname.includes('/media') ||
        pathname.includes('/assets');

      if (isLikelyVideo || /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(pathname)) {
        return {
          type: 'mp4',
          embedUrl: url,
        };
      }
    }

    // Extensionless or signed CDN URLs with tokens/expiry – allow and defer classification to server
    const hasQueryToken = /(?:token|signature|sig|expires|expiry|exp)=/i.test(search);
    if (!pathname.split('/').pop()?.includes('.')) {
      return { type: 'unknown', embedUrl: url };
    }

    if (hasQueryToken) {
      return { type: 'unknown', embedUrl: url };
    }

    return null;
  } catch (error) {
    console.error('Error parsing video URL:', error);
    return null;
  }
}

export function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function calculateCurrentTime(videoState: {
  currentTime: number;
  isPlaying: boolean;
  lastUpdateTime: number;
}): number {
  if (!videoState.isPlaying) {
    return videoState.currentTime;
  }

  const timeDiff = (Date.now() - videoState.lastUpdateTime) / 1000;
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
