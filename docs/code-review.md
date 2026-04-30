# Code Review Guidelines

This guide lists what reviewers look for in changes to watch.sideby.me.

## Structure and placement

- New code lives in the right place:
  - Feature UI and hooks under `src/features/<feature>/`.
  - Cross-cutting client infra under `src/core/`.
  - Utilities under `src/lib/`.
- Routes in `app/` remain thin and delegate to features.
- Backend changes (services, Redis helpers, socket handlers) belong in `sync.sideby.me`, not here.

## Naming and style

- Component, hook, and helper names follow the naming and style guide.
- Socket event names extend `SocketEvents` in `types/` instead of using untyped strings.

## Types and schemas

- New socket payloads are typed via `SocketEvents` in `types/`.
- Client does not duplicate type shapes that already exist in `types/`.

## Logging

- Client-side logging uses helpers from `src/core/logger/`.
- No ad-hoc `console.log` in shipped code.

## Performance and reliability

- Changes in hot paths (video sync events, WebRTC, chat) are mindful of:
  - Event volume and debouncing.
  - Unnecessary re-renders.
- Long-running or async operations are handled gracefully.

## Documentation

- Relevant docs in this folder are updated when introducing new patterns or workflows.
- New events or client-side features are briefly described.
