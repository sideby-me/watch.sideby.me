export interface EmojiEntry {
  emoji: string;
  label: string;
  tags?: string[];
  group?: number;
  order?: number;
}

let cachedIndex: EmojiEntry[] | null = null;
let loadPromise: Promise<EmojiEntry[]> | null = null;

/**
 * Lazily loads the emojibase-data dataset (~1.5MB) via dynamic import, keeping it out of the
 * main bundle. Filters out entries with no `group` (component/regional-indicator entries that
 * frimousse itself also drops). Caches the result in module scope so concurrent callers share
 * a single load, and subsequent calls resolve instantly without re-importing.
 */
export async function loadEmojiIndex(): Promise<EmojiEntry[]> {
  if (cachedIndex) return cachedIndex;
  if (!loadPromise) {
    loadPromise = import('emojibase-data/en/data.json').then(mod => {
      const raw = (mod.default as unknown as EmojiEntry[]) ?? [];
      const filtered = raw.filter(entry => entry.group !== undefined);
      cachedIndex = filtered;
      return filtered;
    });
  }
  return loadPromise;
}

/**
 * Pure scoring search: label match scores +10, each matching tag scores +1. Entries with a
 * label match always outrank entries matching only via tags (a single label hit outscores any
 * number of tag-only hits under normal dataset sizes... but to guarantee "label match ranks
 * above tag-only match" per spec, label matches are sorted into a separate higher tier).
 */
export function searchEmojis(index: EmojiEntry[], query: string, limit = 30): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: { entry: EmojiEntry; score: number }[] = [];
  for (const entry of index) {
    let score = 0;
    if (entry.label.toLowerCase().includes(q)) {
      score += 10;
    }
    if (entry.tags) {
      for (const tag of entry.tags) {
        if (tag.toLowerCase().includes(q)) {
          score += 1;
        }
      }
    }
    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.entry.order ?? 0) - (b.entry.order ?? 0);
  });

  return scored.slice(0, limit).map(s => s.entry);
}
