# Code Review Guidelines

This guide lists what reviewers look for in changes to watch.sideby.me.

## Structure and placement

- New code lives in the right place:
  - Feature UI and hooks under `src/features/<feature>/`.
  - Cross-cutting infra under `src/core/`.
  - Utilities under `src/lib/`.
  - Services, Redis helpers, and socket handlers under `server/`.
- Routes in `app/` remain thin and delegate to features.

## Naming and style

- Component, hook, service, and error names follow the naming and style guide.
- Socket event names extend the existing typed events instead of inventing untyped strings.

## Types and schemas

- New socket payloads and responses are typed and validated via shared types/schemas.
- Client and server use the same contracts, imported from `types/` or `server/socket/types.ts`.

## Logging and errors

- Important domain actions are logged using `logEvent` (server) or `src/core/logger` (client).
- Business rule violations use `DomainError` subclasses, not plain `Error`.
- Errors are mapped to clear, user-friendly messages.

## Performance and reliability

- Changes in hot paths (socket handlers, services, video resolution, media/WebRTC) are mindful of:
  - Number of network calls.
  - Redis access patterns.
  - Event volume and debouncing.
- Long-running operations are instrumented with logging where helpful.

## Documentation

- Relevant docs in `docs/` are updated when introducing new patterns, services, or workflows.
- New public APIs (events, services) are documented briefly in the appropriate guide.
