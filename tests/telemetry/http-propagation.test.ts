import { context, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { describe, expect, it, vi } from 'vitest';
import type { CorrelationContext } from '../../server/telemetry/correlation';
import { injectCorrelationHeaders } from '../../server/telemetry/http-propagation';
import { LensClient } from '../../server/video/lens-client';

function makeCorrelation(overrides: Partial<CorrelationContext> = {}): CorrelationContext {
  return {
    trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
    span_id: '00f067aa0ba902b7',
    request_id: 'req-123',
    dispatch_id: 'disp-456',
    room_id: 'room-789',
    user_id: 'user-abc',
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    ...overrides,
  };
}

function makeDoneStream(uuid = 'lens-uuid-1'): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = [
    'event: status\n',
    'data: {"status":"queued"}\n\n',
    'event: done\n',
    `data: {"uuid":"${uuid}","playbackUrl":"https://pipe.sideby.me?uuid=${uuid}","mediaType":"hls","expiresAt":1700000000000,"lowConfidence":false,"ambiguous":false,"alternatives":[]}\n\n`,
  ].join('');

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

describe('HTTP propagation', () => {
  it('produces traceparent header', () => {
    const headers: Record<string, string> = {};
    const correlation = makeCorrelation();
    const span = trace.wrapSpanContext({
      traceId: correlation.trace_id,
      spanId: correlation.span_id,
      traceFlags: 1,
      isRemote: false,
    });

    context.with(trace.setSpan(ROOT_CONTEXT, span), () => {
      injectCorrelationHeaders(headers, correlation);
    });

    expect(headers.traceparent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-0[0-9a-f]$/);
  });

  it('produces baggage header when baggage exists', () => {
    const headers: Record<string, string> = {};
    const correlation = makeCorrelation({ baggage: 'tenant=sideby,user_tier=premium' });

    injectCorrelationHeaders(headers, correlation);

    expect(headers.baggage).toContain('tenant=sideby');
    expect(headers.baggage).toContain('user_tier=premium');
  });

  it('produces x-request-id and x-dispatch-id', () => {
    const headers: Record<string, string> = {};

    injectCorrelationHeaders(headers, makeCorrelation());

    expect(headers['x-request-id']).toBe('req-123');
    expect(headers['x-dispatch-id']).toBe('disp-456');
  });

  it('produces x-room-id and x-user-id when present', () => {
    const headers: Record<string, string> = {};

    injectCorrelationHeaders(headers, makeCorrelation());

    expect(headers['x-room-id']).toBe('room-789');
    expect(headers['x-user-id']).toBe('user-abc');
  });

  it('lens-client includes propagation headers on /capture calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: makeDoneStream('lens-uuid-2'),
    });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const correlation = makeCorrelation();
    const client = new LensClient();
    await client.capture('https://example.com/video-page', undefined, correlation);

    const fetchArgs = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestHeaders = fetchArgs[1].headers as Record<string, string>;

    expect(requestHeaders['x-request-id']).toBe('req-123');
    expect(requestHeaders['x-dispatch-id']).toBe('disp-456');
    expect(requestHeaders['x-room-id']).toBe('room-789');
    expect(requestHeaders['x-user-id']).toBe('user-abc');
  });

  it('preserves existing trace context when already present in headers', () => {
    const traceparent = '00-11111111111111111111111111111111-2222222222222222-01';
    const headers: Record<string, string> = {
      traceparent,
      baggage: 'feature=picker',
      'existing-header': 'value',
    };

    injectCorrelationHeaders(headers, makeCorrelation());

    expect(headers.traceparent).toBe(traceparent);
    expect(headers.baggage).toContain('feature=picker');
    expect(headers['existing-header']).toBe('value');
  });
});
