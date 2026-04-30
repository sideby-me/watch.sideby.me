# Logging and Observability

This guide describes how client-side logging works in watch.sideby.me.

For server-side logging, see [`sync.sideby.me/docs/logging-and-observability.md`](https://github.com/sideby-me/sync.sideby.me/docs/logging-and-observability.md).

## Client logging

Use helpers from `src/core/logger/`:

- `logRoom` — room lifecycle events (join, leave, host changes)
- `logVideo` — video player events (load, error, source change)
- `logChat` — chat events (send, receive, typing)
- `logVoice` — voice call events (join, leave, reconnect)
- `logVideoChat` — video call events
- `logSubtitles` — subtitle load/search events
- `logCast` — Google Cast events
- `logDebug` — debug-only logging (suppressed in production builds)

Include a clear `event` name and human-readable `message`. Add `meta` when additional context is useful.

## When to log

- Socket connection state changes (connect, disconnect, reconnect).
- Room join/leave and socket initialization.
- Video player errors and source changes.
- WebRTC connection failures and reconnections.
- Subtitle load errors.

Avoid logging sensitive content (chat message text, user names, video URLs with auth tokens).

## OTEL

Client telemetry is set up in `src/lib/telemetry/`. Configure `OTEL_EXPORTER_OTLP_ENDPOINT` to forward logs and traces to an observability backend.
