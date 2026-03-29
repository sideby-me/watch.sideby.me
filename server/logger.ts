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
