# Patterns and Best Practices

This guide summarizes the patterns that are actually used in watch.sideby.me today.

## Thin routes, rich features

- Keep `app/` routes thin:
  - Example: `app/room/[roomId]/page.tsx` simply reads `roomId` from `useParams` and renders `RoomShell` from `src/features/room`.
  - Routing components should not contain complex business logic.
- Put feature logic into `src/features/<feature>/components` and `src/features/<feature>/hooks`.

## Feature-first organization

- Each feature (room, chat, video sync, media, subtitles) owns:
  - Its UI components (e.g. shells, overlays, forms).
  - Its hooks (state management, socket bindings, side effects).
- Shared wiring (socket provider, theme, notifications, logger) lives under `src/core/`.
- Shared helpers and utilities live under `src/lib/`.

## Services and repositories

- On the server:
  - Socket handlers in `server/socket/handlers/` should be **thin adapters**:
    - Validate and parse payloads.
    - Call services in `server/services/`.
    - Emit typed responses and errors.
  - Services in `server/services/` encapsulate business logic and invariants.
  - Redis helpers in `server/redis/` are responsible for low-level data access.

## Typed contracts and schemas

- Socket events are defined and typed in `server/socket/types.ts` and shared `types/`.
- Use shared schemas (e.g. Zod schemas in `types/`) for validating incoming payloads.
- Keep client and server in sync by importing from shared types instead of duplicating shapes.

## Logging and observability

- Log important domain events on the server with `logEvent` (room joins, leaves, video resolution decisions, chat events, media joins/leaves).
- Use client logging helpers for debug and UX-related events.
- Prefer structured logs with `domain`, `event`, and `meta` instead of ad-hoc console logs.

## Error handling

- Throw `DomainError` subclasses from services when enforcing business rules (not found, permission, validation, rate limiting, locked rooms, passcodes, capacity).
- Let the socket error handler map domain errors to appropriate socket error events and user-facing messages.
- In the client, handle these errors in a user-friendly way (toasts, banners, dialog copy) instead of showing raw codes.
