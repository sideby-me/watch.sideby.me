// A simple in-memory sliding window rate limiter

interface SlidingWindow {
  timestamps: number[];
}

export interface RateLimiterConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  remaining: number;
}

export function createRateLimiter(config: RateLimiterConfig) {
  const { windowMs, maxRequests } = config;
  const windows = new Map<string, SlidingWindow>();

  // Periodically prune stale entries to prevent unbounded memory growth.
  const PRUNE_INTERVAL = Math.max(windowMs * 2, 120_000); // at least 2 min
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, win] of windows) {
      win.timestamps = win.timestamps.filter(t => t > cutoff);
      if (win.timestamps.length === 0) {
        windows.delete(key);
      }
    }
  }, PRUNE_INTERVAL).unref(); // unref so the timer doesn't block shutdown

  function check(key: string): RateLimitResult {
    const now = Date.now();
    const cutoff = now - windowMs;

    let win = windows.get(key);
    if (!win) {
      win = { timestamps: [] };
      windows.set(key, win);
    }

    // Slide the window: remove timestamps older than the window.
    win.timestamps = win.timestamps.filter(t => t > cutoff);

    if (win.timestamps.length >= maxRequests) {
      // Find when the oldest request in the window expires.
      const oldestInWindow = win.timestamps[0];
      const retryAfterMs = oldestInWindow + windowMs - now;
      return {
        allowed: false,
        retryAfterMs: Math.max(retryAfterMs, 1),
        remaining: 0,
      };
    }

    win.timestamps.push(now);
    return {
      allowed: true,
      remaining: maxRequests - win.timestamps.length,
    };
  }

  function reset(key: string): void {
    windows.delete(key);
  }

  return { check, reset };
}
