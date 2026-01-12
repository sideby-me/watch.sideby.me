# Real-time Flows

This guide summarizes how real-time features are wired end to end.

## Socket contracts

- Socket event types are defined in `server/socket/types.ts` and shared `types/`.
- Both client and server import these shared contracts to stay in sync.

## Handlers and services

- For each domain (room, chat, video sync, voice, videochat, subtitles):
  - Socket handlers in `server/socket/handlers/` parse and validate incoming events.
  - Services in `server/services/` implement domain behavior and use Redis helpers.
  - Handlers emit typed success and error events back to clients.

## Client features

- Features under `src/features/` subscribe to and emit events using shared socket hooks from `src/core/socket`.
- Hooks encapsulate binding to specific events and updating local state (e.g. room state, chat messages, video sync, media participants).

## Adding or changing events

1. Extend the shared event types in `server/socket/types.ts` and `types/`.
2. Implement or update a handler in `server/socket/handlers/`.
3. Add or update a service in `server/services/` if needed.
4. Update client hooks/components under `src/features/` to use the new or changed event.
