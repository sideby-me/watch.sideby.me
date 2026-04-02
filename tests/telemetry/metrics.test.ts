import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { metrics, Counter, Histogram } from '@opentelemetry/api';

describe('dispatch metrics', () => {
  let mockMeter: ReturnType<typeof metrics.getMeter>;
  let mockCounters: Map<string, Counter>;
  let mockHistograms: Map<string, Histogram>;

  beforeEach(() => {
    mockCounters = new Map();
    mockHistograms = new Map();
    mockMeter = {
      createCounter: vi.fn((name: string) => {
        const counter = {
          add: vi.fn(),
        } as unknown as Counter;
        mockCounters.set(name, counter);
        return counter;
      }),
      createHistogram: vi.fn((name: string) => {
        const histogram = {
          record: vi.fn(),
        } as unknown as Histogram;
        mockHistograms.set(name, histogram);
        return histogram;
      }),
      createUpDownCounter: vi.fn(),
      createObservableGauge: vi.fn(),
    } as unknown as typeof mockMeter;

    vi.spyOn(metrics, 'getMeter').mockReturnValue(mockMeter);
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  describe('instrument creation', () => {
    it('should create dispatch_requests_total counter with endpoint and outcome labels', async () => {
      const { createDispatchMetrics } = await import('../../server/telemetry/metrics.js');
      createDispatchMetrics();

      expect(mockMeter.createCounter).toHaveBeenCalledWith(
        'dispatch_requests_total',
        expect.objectContaining({
          description: expect.any(String),
          unit: '{request}',
        })
      );
    });

    it('should create dispatch_latency_ms histogram with endpoint and outcome labels', async () => {
      const { createDispatchMetrics } = await import('../../server/telemetry/metrics.js');
      createDispatchMetrics();

      expect(mockMeter.createHistogram).toHaveBeenCalledWith(
        'dispatch_latency_ms',
        expect.objectContaining({
          description: expect.any(String),
          unit: 'ms',
        })
      );
    });

    it('should create dispatch_errors_total counter with endpoint and error_type labels', async () => {
      const { createDispatchMetrics } = await import('../../server/telemetry/metrics.js');
      createDispatchMetrics();

      expect(mockMeter.createCounter).toHaveBeenCalledWith(
        'dispatch_errors_total',
        expect.objectContaining({
          description: expect.any(String),
          unit: '{error}',
        })
      );
    });
  });

  describe('recordDispatchStart', () => {
    it('should return a stop function that records latency', async () => {
      const { createDispatchMetrics, recordDispatchStart } = await import('../../server/telemetry/metrics.js');
      createDispatchMetrics();

      const stopTimer = recordDispatchStart('set-video');

      // Simulate some passage of time
      await new Promise(resolve => setTimeout(resolve, 10));

      const latencyMs = stopTimer();

      expect(typeof latencyMs).toBe('number');
      expect(latencyMs).toBeGreaterThanOrEqual(10);
      expect(mockHistograms.get('dispatch_latency_ms')?.record).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({
          endpoint: 'set-video',
          outcome: 'success',
        })
      );
    });

    it('should not throw when metrics recording fails', async () => {
      const { createDispatchMetrics, recordDispatchStart } = await import('../../server/telemetry/metrics.js');
      createDispatchMetrics();

      // Make the histogram throw
      const histogram = mockHistograms.get('dispatch_latency_ms');
      if (histogram) {
        (histogram as unknown as { record: ReturnType<typeof vi.fn> }).record.mockImplementation(() => {
          throw new Error('metrics backend unavailable');
        });
      }

      const stopTimer = recordDispatchStart('set-video');

      // Should not throw even when the underlying record throws
      expect(() => stopTimer()).not.toThrow();
    });
  });

  describe('recordDispatchOutcome', () => {
    it('should increment dispatch_requests_total counter with correct labels', async () => {
      const { createDispatchMetrics, recordDispatchOutcome } = await import('../../server/telemetry/metrics.js');
      createDispatchMetrics();

      recordDispatchOutcome('set-video', 'success');

      expect(mockCounters.get('dispatch_requests_total')?.add).toHaveBeenCalledWith(1, {
        endpoint: 'set-video',
        outcome: 'success',
      });
    });

    it('should accept bounded outcome values', async () => {
      const { createDispatchMetrics, recordDispatchOutcome } = await import('../../server/telemetry/metrics.js');
      createDispatchMetrics();

      // Test all valid outcome values
      const outcomes: Array<'success' | 'failure' | 'timeout'> = ['success', 'failure', 'timeout'];

      for (const outcome of outcomes) {
        recordDispatchOutcome('set-video', outcome);
        expect(mockCounters.get('dispatch_requests_total')?.add).toHaveBeenCalledWith(1, {
          endpoint: 'set-video',
          outcome,
        });
      }
    });

    it('should not throw when counter recording fails', async () => {
      const { createDispatchMetrics, recordDispatchOutcome } = await import('../../server/telemetry/metrics.js');
      createDispatchMetrics();

      const counter = mockCounters.get('dispatch_requests_total');
      if (counter) {
        (counter as unknown as { add: ReturnType<typeof vi.fn> }).add.mockImplementation(() => {
          throw new Error('metrics backend unavailable');
        });
      }

      expect(() => recordDispatchOutcome('set-video', 'success')).not.toThrow();
    });
  });

  describe('recordDispatchError', () => {
    it('should increment dispatch_errors_total counter with correct labels', async () => {
      const { createDispatchMetrics, recordDispatchError } = await import('../../server/telemetry/metrics.js');
      createDispatchMetrics();

      recordDispatchError('set-video', 'upstream-error');

      expect(mockCounters.get('dispatch_errors_total')?.add).toHaveBeenCalledWith(1, {
        endpoint: 'set-video',
        error_type: 'upstream-error',
      });
    });

    it('should accept bounded error_type values', async () => {
      const { createDispatchMetrics, recordDispatchError } = await import('../../server/telemetry/metrics.js');
      createDispatchMetrics();

      // Test all valid error_type values
      const errorTypes: Array<'upstream-error' | 'timeout' | 'validation-error'> = ['upstream-error', 'timeout', 'validation-error'];

      for (const errorType of errorTypes) {
        recordDispatchError('set-video', errorType);
        expect(mockCounters.get('dispatch_errors_total')?.add).toHaveBeenCalledWith(1, {
          endpoint: 'set-video',
          error_type: errorType,
        });
      }
    });

    it('should not throw when error counter recording fails', async () => {
      const { createDispatchMetrics, recordDispatchError } = await import('../../server/telemetry/metrics.js');
      createDispatchMetrics();

      const counter = mockCounters.get('dispatch_errors_total');
      if (counter) {
        (counter as unknown as { add: ReturnType<typeof vi.fn> }).add.mockImplementation(() => {
          throw new Error('metrics backend unavailable');
        });
      }

      expect(() => recordDispatchError('set-video', 'upstream-error')).not.toThrow();
    });
  });
});
