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
