// This module manages a blocklist of URL patterns for video sources.  It provides functions to check if a URL is blocked, and to add/remove patterns from the blocklist

import * as fs from 'fs';
import * as path from 'path';
import { logEvent } from '@/server/logger';

export interface BlocklistEntry {
  pattern: string;
  reason: string;
  addedAt: number;
}

interface BlockCheckResult {
  blocked: boolean;
  reason?: string;
}

const BLOCKLIST_PATH = path.join(__dirname, 'blocklist.json');
const entries = new Map<string, BlocklistEntry>();

function loadFromDisk(): void {
  try {
    if (!fs.existsSync(BLOCKLIST_PATH)) return;
    const raw = fs.readFileSync(BLOCKLIST_PATH, 'utf-8');
    const parsed: BlocklistEntry[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const entry of parsed) {
      if (entry.pattern && entry.reason) {
        entries.set(entry.pattern.toLowerCase(), {
          ...entry,
          pattern: entry.pattern.toLowerCase(),
        });
      }
    }
    if (entries.size > 0) {
      logEvent({
        level: 'info',
        domain: 'video',
        event: 'blocklist_loaded',
        message: `blocklist: loaded ${entries.size} entries`,
      });
    }
  } catch (err) {
    logEvent({
      level: 'warn',
      domain: 'video',
      event: 'blocklist_load_error',
      message: 'blocklist: failed to load from disk',
      meta: { error: String(err) },
    });
  }
}

function persistToDisk(): void {
  try {
    const data = JSON.stringify(Array.from(entries.values()), null, 2);
    fs.writeFileSync(BLOCKLIST_PATH, data, 'utf-8');
  } catch (err) {
    logEvent({
      level: 'error',
      domain: 'video',
      event: 'blocklist_persist_error',
      message: 'blocklist: failed to persist to disk',
      meta: { error: String(err) },
    });
  }
}

// Load on module initialisation.
loadFromDisk();

function matchesDomainPattern(hostname: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2); // e.g. "example.com"
    return hostname === suffix || hostname.endsWith('.' + suffix);
  }
  return hostname === pattern;
}

export function isBlocked(url: string): BlockCheckResult {
  if (entries.size === 0) return { blocked: false };

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return { blocked: false };
  }

  const lowerUrl = url.toLowerCase();

  for (const entry of entries.values()) {
    // Domain match (pattern has no "/")
    if (!entry.pattern.includes('/')) {
      if (matchesDomainPattern(hostname, entry.pattern)) {
        return { blocked: true, reason: entry.reason };
      }
      continue;
    }
    // URL prefix match
    if (lowerUrl.includes(entry.pattern)) {
      return { blocked: true, reason: entry.reason };
    }
  }

  return { blocked: false };
}

export function addBlocklistEntry(pattern: string, reason: string): void {
  const normalised = pattern.toLowerCase().trim();
  if (!normalised) return;

  entries.set(normalised, {
    pattern: normalised,
    reason,
    addedAt: Date.now(),
  });

  persistToDisk();

  logEvent({
    level: 'info',
    domain: 'video',
    event: 'blocklist_entry_added',
    message: `blocklist: added pattern "${normalised}"`,
    meta: { reason },
  });
}

export function removeBlocklistEntry(pattern: string): boolean {
  const normalised = pattern.toLowerCase().trim();
  const existed = entries.delete(normalised);

  if (existed) {
    persistToDisk();
    logEvent({
      level: 'info',
      domain: 'video',
      event: 'blocklist_entry_removed',
      message: `blocklist: removed pattern "${normalised}"`,
    });
  }

  return existed;
}

export function getBlocklist(): BlocklistEntry[] {
  return Array.from(entries.values());
}
