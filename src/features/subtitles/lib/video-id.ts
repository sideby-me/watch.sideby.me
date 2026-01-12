// Extract a stable video ID for subtitle localStorage keying. For YouTube, returns video ID. For other URLs, returns base64-encoded hash prefix.
export function getVideoIdForStorage(videoUrl?: string): string | undefined {
  if (!videoUrl) return undefined;

  try {
    const urlObj = new URL(videoUrl);

    // YouTube URLs
    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
      if (urlObj.hostname.includes('youtu.be')) {
        return urlObj.pathname.slice(1);
      } else if (urlObj.hostname.includes('youtube.com')) {
        return urlObj.searchParams.get('v') || undefined;
      }
    }

    // For other video types, use the full URL as the ID (hashed for localStorage key)
    return btoa(videoUrl)
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 16);
  } catch {
    return undefined;
  }
}
