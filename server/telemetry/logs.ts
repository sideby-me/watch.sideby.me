import { logs, SeverityNumber } from '@opentelemetry/api-logs';

type WatchLogLevel = 'info' | 'warn' | 'error';
type TelemetryAttributeValue = string | number | boolean;

interface WatchTelemetryLogInput {
  level: WatchLogLevel;
  body: string;
  attributes?: Record<string, TelemetryAttributeValue>;
}

let telemetryLogsEnabled = false;
let telemetryLoggerVersion = '0.1.0';

function mapSeverityNumber(level: WatchLogLevel): SeverityNumber {
  switch (level) {
    case 'error':
      return SeverityNumber.ERROR;
    case 'warn':
      return SeverityNumber.WARN;
    default:
      return SeverityNumber.INFO;
  }
}

export function enableWatchTelemetryLogs(version?: string): void {
  telemetryLoggerVersion = version?.trim() || telemetryLoggerVersion;
  telemetryLogsEnabled = true;
}

export function disableWatchTelemetryLogs(): void {
  telemetryLogsEnabled = false;
}

export function emitWatchTelemetryLog(input: WatchTelemetryLogInput): void {
  if (!telemetryLogsEnabled) {
    return;
  }

  try {
    const logger = logs.getLogger('watch.sideby.me.logs', telemetryLoggerVersion);
    logger.emit({
      severityNumber: mapSeverityNumber(input.level),
      severityText: input.level.toUpperCase(),
      body: input.body,
      attributes: input.attributes,
    });
  } catch {
    // Fail-open: logging export must never block core service behavior.
  }
}