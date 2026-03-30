import { context, propagation, trace } from '@opentelemetry/api';

export interface CorrelationContext {
  trace_id: string;
  span_id: string;
  request_id: string | null;
  dispatch_id: string | null;
  room_id: string | null;
  user_id: string | null;
  traceparent: string;
  baggage?: string;
}

function toTraceparent(traceId: string, spanId: string): string {
  return `00-${traceId}-${spanId}-01`;
}

function parseTraceparent(traceparent: string): { traceId: string; spanId: string } | null {
  const parts = traceparent.split('-');
  if (parts.length !== 4) {
    return null;
  }

  const [, traceId, spanId] = parts;
  if (traceId.length !== 32 || spanId.length !== 16) {
    return null;
  }

  return { traceId, spanId };
}

export function buildCorrelationEnvelope(correlation: CorrelationContext): Record<string, string> {
  const seedCarrier: Record<string, string> = {
    traceparent: correlation.traceparent,
  };

  if (correlation.baggage) {
    seedCarrier.baggage = correlation.baggage;
  }

  const extractedContext = propagation.extract(context.active(), seedCarrier);
  const injectedCarrier: Record<string, string> = {};
  propagation.inject(extractedContext, injectedCarrier);

  const carrier: Record<string, string> = {
    traceparent: injectedCarrier.traceparent ?? seedCarrier.traceparent,
  };

  if (seedCarrier.baggage || injectedCarrier.baggage) {
    carrier.baggage = injectedCarrier.baggage ?? seedCarrier.baggage!;
  }

  if (correlation.request_id) {
    carrier['x-request-id'] = correlation.request_id;
  }
  if (correlation.dispatch_id) {
    carrier['x-dispatch-id'] = correlation.dispatch_id;
  }
  if (correlation.room_id) {
    carrier['x-room-id'] = correlation.room_id;
  }
  if (correlation.user_id) {
    carrier['x-user-id'] = correlation.user_id;
  }

  return carrier;
}

export function extractCorrelation(carrier: Record<string, string>): CorrelationContext {
  const extractedContext = propagation.extract(context.active(), carrier);
  const extractedSpanContext = trace.getSpanContext(extractedContext);

  const injectedCarrier: Record<string, string> = {};
  propagation.inject(extractedContext, injectedCarrier);

  const traceparent = injectedCarrier.traceparent ?? carrier.traceparent ?? '';
  const fallback = traceparent ? parseTraceparent(traceparent) : null;
  const traceId = extractedSpanContext?.traceId ?? fallback?.traceId ?? '';
  const spanId = extractedSpanContext?.spanId ?? fallback?.spanId ?? '';

  return {
    trace_id: traceId,
    span_id: spanId,
    request_id: carrier['x-request-id'] ?? null,
    dispatch_id: carrier['x-dispatch-id'] ?? null,
    room_id: carrier['x-room-id'] ?? null,
    user_id: carrier['x-user-id'] ?? null,
    traceparent: traceparent || toTraceparent(traceId, spanId),
    baggage: injectedCarrier.baggage ?? carrier.baggage,
  };
}
