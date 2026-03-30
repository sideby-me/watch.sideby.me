import { context, propagation } from '@opentelemetry/api';
import type { CorrelationContext } from './correlation';

/**
 * Inject W3C trace context + canonical IDs into HTTP headers.
 * Preserves inbound traceparent/baggage if already present on the carrier.
 */
export function injectCorrelationHeaders(
  headers: Record<string, string>,
  correlation: CorrelationContext
): Record<string, string> {
  const seedCarrier: Record<string, string> = {};

  if (headers.traceparent) {
    seedCarrier.traceparent = headers.traceparent;
  }
  if (headers.baggage) {
    seedCarrier.baggage = headers.baggage;
  }

  const extractedContext = propagation.extract(context.active(), seedCarrier);
  propagation.inject(extractedContext, headers);

  headers['x-request-id'] = correlation.request_id ?? '';
  headers['x-dispatch-id'] = correlation.dispatch_id ?? '';

  if (correlation.room_id) {
    headers['x-room-id'] = correlation.room_id;
  }
  if (correlation.user_id) {
    headers['x-user-id'] = correlation.user_id;
  }

  return headers;
}

/**
 * Extract canonical correlation IDs from HTTP headers.
 */
export function extractCorrelationFromHeaders(
  headers: Record<string, string | string[] | undefined>
): Partial<CorrelationContext> {
  const carrier: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      carrier[key.toLowerCase()] = value;
    }
  }

  const extractedContext = propagation.extract(context.active(), carrier);
  const normalizedCarrier: Record<string, string> = {};
  propagation.inject(extractedContext, normalizedCarrier);

  return {
    request_id: carrier['x-request-id'] ?? null,
    dispatch_id: carrier['x-dispatch-id'] ?? null,
    room_id: carrier['x-room-id'] ?? null,
    user_id: carrier['x-user-id'] ?? null,
    traceparent: normalizedCarrier.traceparent ?? carrier.traceparent ?? '',
    baggage: normalizedCarrier.baggage ?? carrier.baggage,
  };
}
