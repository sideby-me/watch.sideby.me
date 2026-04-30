# Patterns and Best Practices

This guide summarizes the frontend patterns used in watch.sideby.me.

For server-side patterns, see [`sync.sideby.me/docs/patterns-and-best-practices.md`](https://github.com/sideby-me/sync.sideby.me/docs/patterns-and-best-practices.md).

## Thin routes, rich features

- Keep `app/` routes thin. Example: `app/room/[roomId]/page.tsx` reads `roomId` and renders `RoomShell` — nothing more.
- Put all feature logic into `src/features/<feature>/components` and `src/features/<feature>/hooks`.

## Feature-first organization

Each feature owns:

- Its UI components (shells, overlays, forms).
- Its hooks (state management, socket bindings, side effects).

Shared client infrastructure (socket provider, logger, notifications, video primitives, config) lives under `src/core/`. Shared pure utilities live under `src/lib/`.

## Typed socket contracts

- Socket events are typed via `SocketEvents` in `types/`.
- Feature hooks bind to specific events and update local state; they do not dispatch to a global store.
- Always extend `SocketEvents` when adding new events — do not use raw string literals.

## Client logging

- Use domain helpers from `src/core/logger/` for structured logging.
- Prefer structured logs over ad-hoc `console.log`.

## Error handling

- Handle socket error events in a user-friendly way: toasts for transient issues, dialogs for blocking errors (locked rooms, passcode prompts, capacity).
- Do not show raw error codes to users.
- See `errors-and-messaging.md` for error codes and UX guidance.

## Performance

- Avoid unnecessary re-renders in high-frequency paths (video sync events, chat).
- Debounce or throttle emits where appropriate (e.g. seek events).
- Keep WebRTC hooks tightly scoped to avoid side effects on unrelated state.
