# Logging and Observability

This guide describes how logging works in watch.sideby.me.

## Server logging

- Use `logEvent` from `server/logger.ts`:
  - `level`: `info` | `warn` | `error`.
  - `domain`: `video` | `room` | `chat` | `voice` | `videochat` | `subtitles` | `other`.
  - `event`: short machine-readable event name (e.g. `room_joined`, `video_resolved`).
  - `message`: human-readable description.
  - Optional: `roomId`, `userId`, `requestId`, `meta`.
- Logs are emitted as JSON lines, prefixed with `[watch]`.
- Prefer `logEvent` over legacy helpers such as `logVideoEvent`.

## Client logging

- Use helpers from `src/core/logger`:
  - `logRoom`, `logVideo`, `logChat`, `logVoice`, `logVideoChat`, `logSubtitles`, `logCast`, `logDebug`.
- `logDebug` and other `debug`-level logs are automatically suppressed in production builds.
- Include a clear `event` and `message`, with `meta` when additional context is useful.

## When to log

- Room lifecycle events (creation, join, leave, host changes, locks, passcodes, capacity issues).
- Chat events (message send/receive, typing indicators, system messages).
- Video resolution decisions (direct vs proxy, errors resolving URLs).
- Video sync events (host/guest sync, major jumps, repeated corrections).
- Media/WebRTC events (voice/videochat joins/leaves, failures, reconnections).

Logging should make it easy to understand what happened in a room without exposing sensitive content.

## Phase 7 telemetry contract alignment

For Phase 7, logs that are intended to correlate with traces must include the same baseline schema used by the telemetry contract.

- Correlation fields for telemetry-linked logs:
  - `trace_id` and `span_id` must be included when trace context exists.
  - `request_id` and `dispatch_id` must be included for request and dispatch lifecycles.
  - `room_id` and `user_id` should be included when applicable.
- Required resource attributes for all telemetry signals:
  - `service.name`
  - `service.version`
  - `deployment.environment`
- Missing key behavior:
  - Missing core IDs (`trace_id`, `span_id`, `request_id`, `dispatch_id`) must emit a warning log and continue fail-open.
  - Missing non-core IDs (`room_id`, `user_id`) should be emitted as `null` and should emit a warning log.

The Phase 7 canonical source of truth is `.planning/phases/07-telemetry-foundation-and-contract/07-contract.md`.
