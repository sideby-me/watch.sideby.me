# Contributing to watch.sideby.me

This guide explains how to work on the watch.sideby.me app.

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
  - Add to `src/lib/` and re-export from the appropriate barrel if needed.
- **Server-side domain logic**:
  - Add or update services under `server/services/`.
  - Add or update Redis helpers under `server/redis/`.
  - Add or update socket handlers under `server/socket/handlers/`.

## Working with sockets

- Define or extend event types in the shared socket contracts (see `server/socket/types.ts` and `types/`).
- Keep handlers thin:
  - Validate input with shared schemas.
  - Call services.
  - Emit typed events.

## Working with logging and errors

- Use `logEvent` from `server/logger.ts` on the server.
- Use helpers from `src/core/logger` on the client.
- Throw `DomainError` subclasses from services and let the socket error handler map them to events and user messages.

## Submitting changes

- Keep pull requests focused on a specific feature or concern.
- Follow the naming and style guide.
- Update or add docs in this folder when you introduce new patterns, services, or workflows.
- Make sure the app still runs locally and any existing tests pass.
