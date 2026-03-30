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

export function buildCorrelationEnvelope(correlation: CorrelationContext): Record<string, string> {
  const seedCarrier: Record<string, string> = {
    traceparent: correlation.traceparent,
  };

  if (correlation.baggage) {
    seedCarrier.baggage = correlation.baggage;
  }

  const extractedContext = propagation.extract(context.active(), seedCarrier);
  const carrier: Record<string, string> = {};
  propagation.inject(extractedContext, carrier);

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
  const spanContext = trace.getSpanContext(extractedContext);

  const injectedCarrier: Record<string, string> = {};
  propagation.inject(extractedContext, injectedCarrier);

  const traceparent = injectedCarrier.traceparent ?? carrier.traceparent ?? '';

  return {
    trace_id: spanContext?.traceId ?? '',
    span_id: spanContext?.spanId ?? '',
    request_id: carrier['x-request-id'] ?? null,
    dispatch_id: carrier['x-dispatch-id'] ?? null,
    room_id: carrier['x-room-id'] ?? null,
    user_id: carrier['x-user-id'] ?? null,
    traceparent: traceparent || toTraceparent(spanContext?.traceId ?? '', spanContext?.spanId ?? ''),
    baggage: injectedCarrier.baggage ?? carrier.baggage,
  };
}
