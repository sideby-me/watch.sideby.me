import { emitWatchTelemetryLog } from './telemetry/logs';

type LogLevel = 'info' | 'warn' | 'error';
type TelemetryAttributeValue = string | number | boolean;

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

function addStringAttribute(
  attributes: Record<string, TelemetryAttributeValue>,
  key: string,
  value: string | null | undefined
): void {
  if (value && value.trim().length > 0) {
    attributes[key] = value;
  }
}

function buildTelemetryAttributes(payload: {
  domain: string;
  event: string;
  request_id: string | null;
  dispatch_id: string | null;
  trace_id: string | null;
  span_id: string | null;
  room_id: string | null;
  user_id: string | null;
}): Record<string, TelemetryAttributeValue> {
  const attributes: Record<string, TelemetryAttributeValue> = {
    domain: payload.domain,
    event: payload.event,
  };

  addStringAttribute(attributes, 'request_id', payload.request_id);
  addStringAttribute(attributes, 'dispatch_id', payload.dispatch_id);
  addStringAttribute(attributes, 'trace_id', payload.trace_id);
  addStringAttribute(attributes, 'span_id', payload.span_id);
  addStringAttribute(attributes, 'room_id', payload.room_id);
  addStringAttribute(attributes, 'user_id', payload.user_id);

  return attributes;
}

export function logEvent(record: LogEventRecord) {
  const shouldWarnMissingNonCore = Boolean(record.requestId || record.dispatchId || record.traceId || record.spanId);

  if (shouldWarnMissingNonCore && (!record.roomId || !record.userId)) {
    const missingKeys = [!record.roomId ? 'room_id' : null, !record.userId ? 'user_id' : null].filter(Boolean);
    const warningPayload = {
      level: 'warn',
      domain: record.domain,
      event: 'telemetry_missing_non_core_ids',
      message: 'Missing non-core telemetry correlation keys',
      request_id: record.requestId ?? null,
      dispatch_id: record.dispatchId ?? null,
      trace_id: record.traceId ?? null,
      span_id: record.spanId ?? null,
      room_id: record.roomId ?? null,
      user_id: record.userId ?? null,
      missing_keys: missingKeys,
      service: 'watch',
      ts: Date.now(),
    };
    const warningLine = JSON.stringify(warningPayload);

    emitWatchTelemetryLog({
      level: 'warn',
      body: warningLine,
      attributes: buildTelemetryAttributes(warningPayload),
    });

    console.warn(warningLine);
  }

  const { traceId, spanId, requestId, dispatchId, roomId, userId, ...restRecord } = record;
  const payload = {
    ...restRecord,
    request_id: record.requestId ?? null,
    dispatch_id: record.dispatchId ?? null,
    trace_id: record.traceId ?? null,
    span_id: record.spanId ?? null,
    room_id: record.roomId ?? null,
    user_id: record.userId ?? null,
    meta: redactMeta(record.meta),
    service: 'watch',
    ts: Date.now(),
  };

  const line = JSON.stringify(payload);

  emitWatchTelemetryLog({
    level: record.level,
    body: line,
    attributes: buildTelemetryAttributes(payload),
  });

  switch (record.level) {
    case 'warn':
      console.warn(line);
      break;
    case 'error':
      console.error(line);
      break;
    default:
      console.log(line);
  }
}

export function logVideoEvent(record: Omit<LogEventRecord, 'domain'>) {
  logEvent({ ...record, domain: 'video' });
}
