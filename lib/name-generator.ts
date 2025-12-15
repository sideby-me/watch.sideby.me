'use client';

import { uniqueNamesGenerator, adjectives, animals, colors, starWars, names } from 'unique-names-generator';

const MAX_NAME_LENGTH = 20;
const MAX_RETRIES = 10;

const NAME_STYLES = [
  { dictionaries: [adjectives, colors, animals], length: 3 },
  { dictionaries: [adjectives, adjectives, animals], length: 3 },
  { dictionaries: [adjectives, colors, starWars], length: 3 },
  { dictionaries: [adjectives, adjectives, names], length: 3 },
  { dictionaries: [colors, adjectives, animals], length: 3 },
];

// Fallback to shorter 2-word format if 3-word is too long
const SHORT_STYLES = [
  { dictionaries: [adjectives, animals], length: 2 },
  { dictionaries: [colors, animals], length: 2 },
  { dictionaries: [adjectives, names], length: 2 },
];

function generate(styles: typeof NAME_STYLES): string {
  const style = styles[Math.floor(Math.random() * styles.length)];
  return uniqueNamesGenerator({
    dictionaries: style.dictionaries,
    separator: ' ',
    style: 'capital',
    length: style.length,
  });
}

export function generateQuirkyName(): string {
  // Try 3-word style first
  for (let i = 0; i < MAX_RETRIES; i++) {
    const name = generate(NAME_STYLES);
    if (name.length <= MAX_NAME_LENGTH) return name;
  }

  // Fallback to 2-word style
  for (let i = 0; i < MAX_RETRIES; i++) {
    const name = generate(SHORT_STYLES);
    if (name.length <= MAX_NAME_LENGTH) return name;
  }

  return 'The NPC';
}
