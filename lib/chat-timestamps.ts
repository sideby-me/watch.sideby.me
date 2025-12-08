// Utilities for detecting, validating, and formatting chat timestamps (MM:SS / HH:MM:SS)

export type ParsedTimestamp = {
  seconds: number;
  display: string;
};

// Fast pre-check used by renderers to avoid unnecessary work
export const CHAT_TIMESTAMP_PATTERN = /\b\d{1,3}:\d{2}(?::\d{2})?\b/;

// Global matcher used during rendering; validation happens in code, not regex
const CHAT_TIMESTAMP_REGEX = /\b\d{1,3}:\d{2}(?::\d{2})?\b/g;

// Attempt to parse a timestamp string into seconds. Returns null if invalid.
export function parseTimestampToSeconds(raw: string): ParsedTimestamp | null {
  const parts = raw.split(':').map(Number);
  if (parts.some(n => Number.isNaN(n) || n < 0)) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    if (!isValidTwoPart(minutes, seconds)) return null;
    const totalSeconds = minutes * 60 + seconds;
    return { seconds: totalSeconds, display: formatTimestamp(totalSeconds) };
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    if (!isValidThreePart(hours, minutes, seconds)) return null;
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    return { seconds: totalSeconds, display: formatTimestamp(totalSeconds) };
  }

  return null;
}

function isValidTwoPart(minutes: number, seconds: number): boolean {
  // Allow long videos by permitting large minute values but enforce valid seconds
  return seconds >= 0 && seconds < 60 && minutes >= 0 && minutes <= 999;
}

function isValidThreePart(hours: number, minutes: number, seconds: number): boolean {
  // Hours may exceed 24 for very long streams; constrain minutes/seconds only
  return minutes >= 0 && minutes < 60 && seconds >= 0 && seconds < 60 && hours >= 0 && hours <= 99;
}

// Format seconds into MM:SS or HH:MM:SS depending on duration
export function formatTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;

  if (hours > 0) {
    return [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':');
  }

  const totalMinutes = Math.floor(clamped / 60);
  return `${String(totalMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Find the next valid timestamp occurrence after a given index
export function findNextTimestamp(
  text: string,
  fromIndex: number
): { start: number; end: number; raw: string; parsed: ParsedTimestamp } | null {
  CHAT_TIMESTAMP_REGEX.lastIndex = fromIndex;
  let match: RegExpExecArray | null;

  while ((match = CHAT_TIMESTAMP_REGEX.exec(text))) {
    const raw = match[0];
    const parsed = parseTimestampToSeconds(raw);
    if (parsed) {
      return {
        start: match.index,
        end: match.index + raw.length,
        raw,
        parsed,
      };
    }
  }

  return null;
}
