type LogLevel = 'info' | 'warn' | 'error';

interface LogEventRecord {
  level: LogLevel;
  domain: 'video' | 'room' | 'chat' | 'voice' | 'videochat' | 'subtitles' | 'other';
  event: string;
  message: string;
  roomId?: string;
  userId?: string;
  requestId?: string;
  dispatchId?: string;
  traceId?: string;
  spanId?: string;
  meta?: Record<string, unknown>;
}

const REDACTED = '[REDACTED]';
const PRESERVE_KEYS = new Set(['trace_id', 'span_id', 'request_id', 'dispatch_id', 'room_id', 'user_id']);
const SENSITIVE_KEY_PATTERNS = [
  /email/i,
  /^ip$/i,
  /ipaddress/i,
  /message(text)?/i,
  /^text$/i,
  /authorization/i,
  /cookie/i,
  /token/i,
  /set-cookie/i,
];

function isSensitiveKey(key: string): boolean {
  if (PRESERVE_KEYS.has(key)) return false;
  return SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => redactValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      out[key] = REDACTED;
      continue;
    }

    out[key] = redactValue(nestedValue);
  }

  return out;
}

function redactMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  return redactValue(meta) as Record<string, unknown>;
}

export function logEvent(record: LogEventRecord) {
  const shouldWarnMissingNonCore = Boolean(record.requestId || record.dispatchId || record.traceId || record.spanId);

  if (shouldWarnMissingNonCore && (!record.roomId || !record.userId)) {
    const missingKeys = [!record.roomId ? 'room_id' : null, !record.userId ? 'user_id' : null].filter(Boolean);
    console.warn(
      '[watch]',
      JSON.stringify({
        level: 'warn',
        domain: record.domain,
        event: 'telemetry_missing_non_core_ids',
        message: 'Missing non-core telemetry correlation keys',
        request_id: record.requestId,
        dispatch_id: record.dispatchId,
        trace_id: record.traceId,
        span_id: record.spanId,
        room_id: record.roomId ?? null,
        user_id: record.userId ?? null,
        missing_keys: missingKeys,
        service: 'watch',
        ts: Date.now(),
      })
    );
  }

  const payload = {
    ...record,
    request_id: record.requestId,
    dispatch_id: record.dispatchId,
    trace_id: record.traceId,
    span_id: record.spanId,
    room_id: record.roomId ?? null,
    user_id: record.userId ?? null,
    meta: redactMeta(record.meta),
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

export function logVideoEvent(record: Omit<LogEventRecord, 'domain'>) {
  logEvent({ ...record, domain: 'video' });
}
