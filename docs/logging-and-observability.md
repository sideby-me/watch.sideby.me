# Logging and Observability

This guide describes how client-side logging works in watch.sideby.me.

For server-side logging, see [`sync.sideby.me/docs/logging-and-observability.md`](https://github.com/sideby-me/sync.sideby.me/docs/logging-and-observability.md).

## Client logging

Use helpers from `src/core/logger/` (`client-logger.ts`):

- `logRoom` — room lifecycle events (join, leave, host changes)
- `logVideo` — video player events (load, error, source change)
- `logChat` — chat events (send, receive, typing)
- `logVoice` — voice call events (join, leave, reconnect)
- `logVideoChat` — video call events
- `logSubtitles` — subtitle load/search events
- `logCast` — Google Cast events
- `logDebug` — debug-only logging (suppressed in production builds)

Include a clear `event` name and human-readable `message`. Add `meta` when additional context is useful.

These helpers write to the browser console. They do not emit OTEL telemetry — that is handled by the server-side logger.

## Server-side (API route) logging

Next.js API route handlers (e.g. `app/api/subtitles/`) use `logEvent` from `src/lib/logger.ts` instead of the client-side helpers. `logEvent` writes structured JSON (fields: `level`, `domain`, `event`, `message`, `room_id`, `user_id`, `trace_id`, etc.) and automatically redacts sensitive metadata keys (tokens, cookies, email, etc.). It also forwards logs to the OTEL backend via `src/lib/telemetry/logs.ts` when the OTEL provider is initialized.

`logVideoEvent` is a convenience wrapper that fixes `domain: 'video'`.

## When to log

- Socket connection state changes (connect, disconnect, reconnect).
- Room join/leave and socket initialization.
- Video player errors and source changes.
- WebRTC connection failures and reconnections.
- Subtitle load errors.

Avoid logging sensitive content (chat message text, user names, video URLs with auth tokens).

## OTEL

The OTEL log emitter lives in `src/lib/telemetry/logs.ts`. It wraps `@opentelemetry/api-logs` and is used by `src/lib/logger.ts`. Emitting is gated on `telemetryLogsEnabled`, which is set by calling `enableWatchTelemetryLogs()`. That call is not currently made anywhere in the app, so OTEL export is inactive. To enable it, initialize an OTEL SDK provider (e.g. in a Next.js `instrumentation.ts`) and call `enableWatchTelemetryLogs()` before handling requests.
