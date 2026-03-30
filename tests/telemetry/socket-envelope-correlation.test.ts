import { describe, expect, it } from 'vitest';
import type { CorrelationContext } from '../../server/telemetry/correlation';
import { extractSocketCorrelation, withCorrelation } from '../../server/socket/correlation-envelope';

function makeContext(overrides: Partial<CorrelationContext> = {}): CorrelationContext {
  return {
    trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
    span_id: '00f067aa0ba902b7',
    request_id: 'req-1',
    dispatch_id: 'disp-1',
    room_id: 'room-1',
    user_id: 'user-1',
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    ...overrides,
  };
}

describe('Socket.IO correlation envelope', () => {
  it('round-trips traceparent without loss', () => {
    const correlation = makeContext();

    const envelope = withCorrelation({ type: 'video-set' }, correlation);
    const extracted = extractSocketCorrelation(envelope);

    expect(envelope.correlation?.traceparent).toBe(correlation.traceparent);
    expect(extracted).not.toBeNull();
    expect(extracted?.trace_id).toBe(correlation.trace_id);
    expect(extracted?.span_id).toBe(correlation.span_id);
    expect(extracted?.traceparent).toBe(correlation.traceparent);
  });

  it('round-trips baggage when present', () => {
    const correlation = makeContext({ baggage: 'user_tier=premium,locale=en-US' });

    const envelope = withCorrelation({ type: 'sync-update' }, correlation);
    const extracted = extractSocketCorrelation(envelope);

    expect(envelope.correlation?.baggage).toBe(correlation.baggage);
    expect(extracted?.baggage).toBe(correlation.baggage);
  });

  it('round-trips all canonical IDs', () => {
    const correlation = makeContext({
      request_id: 'req-abc',
      dispatch_id: 'disp-xyz',
      room_id: 'room-999',
      user_id: 'user-222',
    });

    const envelope = withCorrelation({ type: 'picker-required' }, correlation);
    const extracted = extractSocketCorrelation(envelope);

    expect(envelope.correlation?.request_id).toBe('req-abc');
    expect(envelope.correlation?.dispatch_id).toBe('disp-xyz');
    expect(envelope.correlation?.room_id).toBe('room-999');
    expect(envelope.correlation?.user_id).toBe('user-222');
    expect(extracted?.request_id).toBe('req-abc');
    expect(extracted?.dispatch_id).toBe('disp-xyz');
    expect(extracted?.room_id).toBe('room-999');
    expect(extracted?.user_id).toBe('user-222');
  });

  it('handles null and missing non-core IDs gracefully', () => {
    const correlation = makeContext({
      room_id: null,
      user_id: null,
      dispatch_id: null,
    });

    const envelope = withCorrelation({ type: 'play-video' }, correlation);
    const extracted = extractSocketCorrelation(envelope);

    expect(envelope.correlation?.room_id).toBeNull();
    expect(envelope.correlation?.user_id).toBeNull();
    expect(envelope.correlation?.dispatch_id).toBeNull();
    expect(extracted?.room_id).toBeNull();
    expect(extracted?.user_id).toBeNull();
    expect(extracted?.dispatch_id).toBeNull();
  });

  it('returns null when envelope has no correlation payload', () => {
    expect(extractSocketCorrelation({})).toBeNull();
  });
});
