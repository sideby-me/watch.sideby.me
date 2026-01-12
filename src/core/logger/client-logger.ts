// logClient({ level: 'info', domain: 'room', event: 'join_success', message: 'User joined' });

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogDomain = 'room' | 'video' | 'chat' | 'voice' | 'videochat' | 'subtitles' | 'cast' | 'webrtc' | 'other';

interface ClientLogRecord {
  level: LogLevel;
  domain: LogDomain;
  event: string;
  message: string;
  meta?: Record<string, unknown>;
}

const IS_DEV = process.env.NODE_ENV === 'development';

export function logClient(record: ClientLogRecord): void {
  // Suppress debug in production
  if (record.level === 'debug' && !IS_DEV) return;

  const tag = `[${record.domain}:${record.event}]`;

  switch (record.level) {
    case 'debug':
      console.debug(tag, record.message, record.meta ?? '');
      break;
    case 'info':
      console.log(tag, record.message, record.meta ?? '');
      break;
    case 'warn':
      console.warn(tag, record.message, record.meta ?? '');
      break;
    case 'error':
      console.error(tag, record.message, record.meta ?? '');
      break;
  }
}

// Convenience helpers for common domains
export const logRoom = (event: string, message: string, meta?: Record<string, unknown>) =>
  logClient({ level: 'info', domain: 'room', event, message, meta });

export const logVideo = (event: string, message: string, meta?: Record<string, unknown>) =>
  logClient({ level: 'info', domain: 'video', event, message, meta });

export const logChat = (event: string, message: string, meta?: Record<string, unknown>) =>
  logClient({ level: 'info', domain: 'chat', event, message, meta });

export const logVoice = (event: string, message: string, meta?: Record<string, unknown>) =>
  logClient({ level: 'info', domain: 'voice', event, message, meta });

export const logVideoChat = (event: string, message: string, meta?: Record<string, unknown>) =>
  logClient({ level: 'info', domain: 'videochat', event, message, meta });

export const logSubtitles = (event: string, message: string, meta?: Record<string, unknown>) =>
  logClient({ level: 'info', domain: 'subtitles', event, message, meta });

export const logCast = (event: string, message: string, meta?: Record<string, unknown>) =>
  logClient({ level: 'info', domain: 'cast', event, message, meta });

// Debug-level helper (auto-suppressed in production)
export const logDebug = (domain: LogDomain, event: string, message: string, meta?: Record<string, unknown>) =>
  logClient({ level: 'debug', domain, event, message, meta });
