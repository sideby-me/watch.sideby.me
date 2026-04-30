# Contributing to watch.sideby.me

This guide explains how to work on the watch.sideby.me frontend.

## Before you start

- Make sure you can run the app locally (see `local-development.md`).
- Skim the architecture, file structure, and patterns docs in this folder.

## Where to put things

- **New UI tied to a domain** (room, chat, video sync, media, subtitles):
  - Add components under `src/features/<feature>/components/`.
  - Add hooks under `src/features/<feature>/hooks/`.
- **Cross-cutting client infrastructure** (socket provider, logger, notifications, video primitives, config):
  - Add or extend modules under `src/core/`.
- **Reusable utilities**:
  - Add to `src/lib/`.
- **Backend changes** (socket handlers, services, Redis, video dispatch):
  - Those live in [`sync.sideby.me`](https://github.com/sideby-me/sync.sideby.me/). See its contributing guide.

## Working with sockets

- The client connects to `sync.sideby.me` via `src/core/socket/socket-provider.tsx`.
- Use the `useSocket()` hook from `src/core/socket/` to access the socket instance.
- Socket event types are defined in `types/` (`SocketEvents`). Extend these when adding new events.
- Keep feature hooks thin: bind to events in hooks, update local state, and emit via the socket.

## Working with client logging

- Use helpers from `src/core/logger/` (`logRoom`, `logVideo`, `logChat`, `logVoice`, `logVideoChat`, `logSubtitles`, `logCast`, `logDebug`).
- `logDebug` is suppressed in production automatically.

## Submitting changes

- Keep pull requests focused on a single feature or concern.
- Follow the naming and style guide.
- Update docs in this folder when you introduce new patterns or workflows.
- Make sure the app runs locally and existing tests pass.
