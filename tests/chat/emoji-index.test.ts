import { describe, it, expect } from 'vitest';
import { searchEmojis, type EmojiEntry } from '@/src/features/chat/emoji-index';

const fixture: EmojiEntry[] = [
  { emoji: '😄', label: 'smile with big eyes', tags: ['happy', 'joy'], group: 0, order: 1 },
  { emoji: '😊', label: 'smile face', tags: ['happy', 'blush'], group: 0, order: 2 },
  { emoji: '🙂', label: 'slightly smiling face', tags: ['content'], group: 0, order: 3 },
  { emoji: '😀', label: 'grinning face', tags: ['smile', 'happy'], group: 0, order: 0 },
  { emoji: '😐', label: 'neutral face', tags: ['meh'], group: 0, order: 4 },
  { emoji: '🎉', label: 'party popper', tags: ['celebration'], group: 1, order: 5 },
];

describe('searchEmojis', () => {
  it('returns [] for an empty query', () => {
    expect(searchEmojis(fixture, '')).toEqual([]);
  });

  it('returns [] for a whitespace-only query', () => {
    expect(searchEmojis(fixture, '   ')).toEqual([]);
  });

  it('ranks label matches above tag-only matches', () => {
    // "smile" matches label ("slightly smiling face", "smiling face with smiling eyes")
    // and matches tag-only on "grinning face" (tags include "smile").
    const results = searchEmojis(fixture, 'smile');
    const labelMatches = results.filter(e => e.label.toLowerCase().includes('smile'));
    const tagOnlyMatches = results.filter(e => !e.label.toLowerCase().includes('smile'));

    expect(labelMatches.length).toBeGreaterThan(0);
    expect(tagOnlyMatches.length).toBeGreaterThan(0);

    const lastLabelIdx = results.lastIndexOf(labelMatches[labelMatches.length - 1]);
    const firstTagOnlyIdx = results.indexOf(tagOnlyMatches[0]);
    expect(lastLabelIdx).toBeLessThan(firstTagOnlyIdx);
  });

  it('matches on tags when label does not match', () => {
    const results = searchEmojis(fixture, 'happy');
    const emojis = results.map(e => e.emoji);
    expect(emojis).toContain('😄');
    expect(emojis).toContain('😊');
    expect(emojis).toContain('😀');
    expect(emojis).not.toContain('🎉');
  });

  it('breaks ties by ascending order', () => {
    // "happy" tag-matches 😄 (order 1), 😊 (order 2), 😀 (order 0), all score 1 (tag-only)
    const results = searchEmojis(fixture, 'happy');
    const orders = results.map(e => e.order);
    const sorted = [...orders].sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(orders).toEqual(sorted);
  });

  it('caps results at the limit', () => {
    const bigFixture: EmojiEntry[] = Array.from({ length: 50 }, (_, i) => ({
      emoji: `E${i}`,
      label: `test emoji ${i}`,
      tags: ['test'],
      group: 0,
      order: i,
    }));
    const results = searchEmojis(bigFixture, 'test', 10);
    expect(results.length).toBe(10);
  });

  it('defaults the limit to 30', () => {
    const bigFixture: EmojiEntry[] = Array.from({ length: 50 }, (_, i) => ({
      emoji: `E${i}`,
      label: `test emoji ${i}`,
      tags: ['test'],
      group: 0,
      order: i,
    }));
    const results = searchEmojis(bigFixture, 'test');
    expect(results.length).toBe(30);
  });
});
