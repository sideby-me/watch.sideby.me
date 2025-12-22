// External video proxy URL
export const VIDEO_PROXY_URL = process.env.NEXT_PUBLIC_VIDEO_PROXY_URL || 'https://pipe.sideby.me';

// Build a proxied video URL
export function buildProxyUrl(targetUrl: string, referer?: string): string {
  const params = new URLSearchParams({ url: targetUrl });
  if (referer) params.set('referer', referer);
  return `${VIDEO_PROXY_URL}?${params.toString()}`;
}

// Check if a URL is already proxied
export function isProxiedUrl(url: string): boolean {
  return url.includes('pipe.sideby.me') || url.includes('/api/video-proxy');
}
