import { buildCorrelationEnvelope, extractCorrelation, type CorrelationContext } from '../telemetry/correlation';

export interface SocketCorrelationEnvelope {
  correlation?: {
    traceparent: string;
    baggage?: string;
    request_id?: string | null;
    dispatch_id?: string | null;
    room_id?: string | null;
    user_id?: string | null;
  };
}

export function withCorrelation<T extends object>(
  payload: T,
  context: CorrelationContext
): T & SocketCorrelationEnvelope {
  const carrier = buildCorrelationEnvelope(context);

  return {
    ...payload,
    correlation: {
      traceparent: carrier.traceparent ?? context.traceparent,
      ...(carrier.baggage ? { baggage: carrier.baggage } : {}),
      request_id: carrier['x-request-id'] ?? context.request_id ?? null,
      dispatch_id: carrier['x-dispatch-id'] ?? context.dispatch_id ?? null,
      room_id: carrier['x-room-id'] ?? context.room_id ?? null,
      user_id: carrier['x-user-id'] ?? context.user_id ?? null,
    },
  };
}

export function extractSocketCorrelation(envelope: SocketCorrelationEnvelope): CorrelationContext | null {
  const correlation = envelope.correlation;
  if (!correlation?.traceparent) {
    return null;
  }

  const carrier: Record<string, string> = {
    traceparent: correlation.traceparent,
  };

  if (correlation.baggage) {
    carrier.baggage = correlation.baggage;
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

  return extractCorrelation(carrier);
}
