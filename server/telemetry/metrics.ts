/**
 * Golden signal metric instruments for the watch dispatch path.
 *
 * Exposes latency, error rate, and throughput metrics for dispatch operations
 * following the OpenTelemetry semantic conventions.
 *
 * All metric calls are wrapped in try/catch for fail-open behavior.
 */

import { metrics, Counter, Histogram } from '@opentelemetry/api';

type DispatchOutcome = 'success' | 'failure' | 'timeout' | 'degraded';
type DispatchErrorType = 'upstream-error' | 'timeout' | 'validation-error';

interface DispatchMetrics {
  requestsTotal: Counter;
  latencyMs: Histogram;
  errorsTotal: Counter;
}

let dispatchMetrics: DispatchMetrics | null = null;

/**
 * Creates and caches the dispatch metric instruments.
 * Safe to call multiple times - returns cached instruments.
 */
export function createDispatchMetrics(): DispatchMetrics {
  if (dispatchMetrics) {
    return dispatchMetrics;
  }

  const meter = metrics.getMeter('watch.sideby.me', '1.0.0');

  const requestsTotal = meter.createCounter('dispatch_requests_total', {
    description: 'Total number of dispatch requests',
    unit: '{request}',
  });

  const latencyMs = meter.createHistogram('dispatch_latency_ms', {
    description: 'Dispatch request latency in milliseconds',
    unit: 'ms',
  });

  const errorsTotal = meter.createCounter('dispatch_errors_total', {
    description: 'Total number of dispatch errors',
    unit: '{error}',
  });

  dispatchMetrics = {
    requestsTotal,
    latencyMs,
    errorsTotal,
  };

  return dispatchMetrics;
}

/**
 * Records the start of a dispatch request.
 * Returns a stop function that records the latency when called.
 *
 * @param endpoint - The dispatch endpoint name (e.g., 'set-video')
 * @returns A stop function that records latency and returns the duration in ms
 */
export function recordDispatchStart(endpoint: string): () => number {
  const startTime = Date.now();
  const metricsInstance = createDispatchMetrics();

  return (): number => {
    const duration = Date.now() - startTime;

    try {
      metricsInstance.latencyMs.record(duration, {
        endpoint,
        outcome: 'success',
      });
    } catch {
      // Fail-open: metric recording errors must not affect dispatch behavior
    }

    return duration;
  };
}

/**
 * Records a dispatch request outcome.
 *
 * @param endpoint - The dispatch endpoint name (e.g., 'set-video')
 * @param outcome - The outcome of the dispatch request
 */
export function recordDispatchOutcome(
  endpoint: string,
  outcome: DispatchOutcome
): void {
  const metricsInstance = createDispatchMetrics();

  try {
    metricsInstance.requestsTotal.add(1, {
      endpoint,
      outcome,
    });
  } catch {
    // Fail-open: metric recording errors must not affect dispatch behavior
  }
}

/**
 * Records a dispatch error.
 *
 * @param endpoint - The dispatch endpoint name (e.g., 'set-video')
 * @param errorType - The type of error that occurred
 */
export function recordDispatchError(
  endpoint: string,
  errorType: DispatchErrorType
): void {
  const metricsInstance = createDispatchMetrics();

  try {
    metricsInstance.errorsTotal.add(1, {
      endpoint,
      error_type: errorType,
    });
  } catch {
    // Fail-open: metric recording errors must not affect dispatch behavior
  }
}
