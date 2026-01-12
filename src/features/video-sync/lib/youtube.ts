/**
 * Extract YouTube video ID from various URL formats:
 * - youtu.be/ID
 * - youtube.com/watch?v=ID
 * - youtube.com/embed/ID
 * - bare 11-char ID string
 */
export function extractYouTubeId(url: string | undefined): string | undefined {
  if (!url) return undefined;

  try {
    // Check if it's already a bare 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;

    const u = new URL(url);

    // youtu.be short URLs
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.slice(1);
      return id || undefined;
    }

    // youtube.com/watch?v=ID
    const v = u.searchParams.get('v');
    if (v) return v;

    // youtube.com/embed/ID
    const embedMatch = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) return embedMatch[1];

    return undefined;
  } catch {
    return undefined;
  }
}
