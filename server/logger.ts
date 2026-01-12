type LogLevel = 'info' | 'warn' | 'error';

interface LogEventRecord {
  level: LogLevel;
  domain: 'video' | 'room' | 'chat' | 'voice' | 'videochat' | 'subtitles' | 'other';
  event: string;
  message: string;
  roomId?: string;
  userId?: string;
  requestId?: string;
  meta?: Record<string, unknown>;
}

export function logEvent(record: LogEventRecord) {
  const payload = {
    ...record,
    service: 'watch',
    ts: Date.now(),
  };

  const line = JSON.stringify(payload);

  switch (record.level) {
    case 'warn':
      console.warn('[watch]', line);
      break;
    case 'error':
      console.error('[watch]', line);
      break;
    default:
      console.log('[watch]', line);
  }
}

// Legacy helper for video-specific logs; prefer logEvent going forward.
export function logVideoEvent(record: Omit<LogEventRecord, 'domain'>) {
  logEvent({ ...record, domain: 'video' });
}
