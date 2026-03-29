import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatch } from '../../server/video/dispatch';
import { logEvent } from '../../server/logger';
import { initializeTelemetry, resolveTelemetryResourceAttributes } from '../../server/telemetry/bootstrap';

describe('watch telemetry bootstrap contract', () => {
  it('exposes required resource attributes', () => {
    const attributes = resolveTelemetryResourceAttributes({
      NODE_ENV: 'test',
      npm_package_version: '1.2.3',
      OTEL_SERVICE_NAME: 'watch-test',
    });

    expect(attributes['service.name']).toBe('watch-test');
    expect(attributes['service.version']).toBe('1.2.3');
    expect(attributes['deployment.environment']).toBe('test');
  });

  it('keeps startup fail-open when exporter initialization fails', async () => {
    const warnings: string[] = [];

    await expect(
      initializeTelemetry({
        env: {
          NODE_ENV: 'test',
          npm_package_version: '1.0.0',
          OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:0',
        },
        logger: {
          warn: message => {
            warnings.push(message);
          },
        },
        sdkFactory: () => {
          throw new Error('exporter unavailable');
        },
      })
    ).resolves.not.toThrow();

    expect(warnings.some(w => w.includes('telemetry bootstrap failed'))).toBe(true);
  });
});

describe('watch telemetry correlation contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes request_id and dispatch_id in dispatch logs when provided', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return;
    });

    await dispatch('https://youtube.com/watch?v=dQw4w9WgXcQ', undefined, {
      requestId: 'req-123',
      dispatchId: 'disp-456',
    });

    const payloads = logSpy.mock.calls
      .map(call => String(call[1] ?? ''))
      .filter(Boolean)
      .map(line => JSON.parse(line) as Record<string, unknown>);

    const dispatchEvent = payloads.find(payload => payload.event === 'dispatch_youtube');

    expect(dispatchEvent?.request_id).toBe('req-123');
    expect(dispatchEvent?.dispatch_id).toBe('disp-456');
  });

  it('warns for missing non-core IDs while still emitting the event', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      return;
    });
    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return;
    });

    logEvent({
      level: 'info',
      domain: 'video',
      event: 'dispatch_contract_event',
      message: 'dispatch log for contract validation',
      requestId: 'req-1',
    });

    expect(warnSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
  });

  it('includes trace_id and span_id in structured payloads', () => {
    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return;
    });

    logEvent({
      level: 'info',
      domain: 'video',
      event: 'trace_enrichment',
      message: 'trace context attached',
      traceId: 'trace-abc',
      spanId: 'span-xyz',
    });

    const line = String(infoSpy.mock.calls[0]?.[1] ?? '{}');
    const payload = JSON.parse(line) as Record<string, unknown>;

    expect(payload.trace_id).toBe('trace-abc');
    expect(payload.span_id).toBe('span-xyz');
  });
});
