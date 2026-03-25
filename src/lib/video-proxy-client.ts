// Proxy URL from environment, when absent, proxy is disabled and all URLs are played directly
const VIDEO_PROXY_RAW = process.env.NEXT_PUBLIC_VIDEO_PROXY_URL?.trim();

export const PROXY_ENABLED = Boolean(VIDEO_PROXY_RAW);
export const VIDEO_PROXY_URL = VIDEO_PROXY_RAW ?? '';

export function buildProxyUrl(targetUrl: string): string {
  if (!PROXY_ENABLED) return targetUrl;
  if (isProxiedUrl(targetUrl)) return targetUrl;

  const params = new URLSearchParams({ url: targetUrl });
  return `${VIDEO_PROXY_URL}?${params.toString()}`;
}

// Build a pipe uuid= playback URL for a Lens-captured media payload.
export function buildLensPlaybackUrl(uuid: string): string {
  if (!PROXY_ENABLED) throw new Error('NEXT_PUBLIC_VIDEO_PROXY_URL is not set - cannot build Lens playback URL');
  return `${VIDEO_PROXY_URL}?uuid=${uuid}`;
}

export function isProxiedUrl(url: string): boolean {
  if (!PROXY_ENABLED || !url) return false;
  return url.startsWith(VIDEO_PROXY_URL);
}
