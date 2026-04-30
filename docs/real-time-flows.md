# Real-time Flows

This guide summarizes how real-time features are wired on the client side.

For the server-side event handling (handlers, services, Redis), see [`sync.sideby.me/docs/real-time-flows.md`](https://github.com/sideby-me/sync.sideby.me/docs/real-time-flows.md).

## Socket connection

The `SocketProvider` in `src/core/socket/socket-provider.tsx` creates a Socket.IO client connected to `NEXT_PUBLIC_SYNC_URL` (default `http://localhost:3001`). It exposes the socket instance via `useSocket()`.

## Socket event contracts

Socket events are typed via `SocketEvents` in `types/`. Both client hooks and the `SocketProvider` use this type to ensure event names and payload shapes match `sync.sideby.me`.

## How feature hooks work

Feature hooks (e.g. in `src/features/room/hooks/`, `src/features/chat/hooks/`) follow the same pattern:

1. Get the socket from `useSocket()`.
2. Register `socket.on(...)` listeners in a `useEffect` (cleaned up on unmount).
3. Update local React state when events arrive.
4. Expose emit functions (e.g. `sendMessage`, `setVideo`) that call `socket.emit(...)`.

## Adding or changing events

1. Add or extend the event in `types/` (`SocketEvents`).
2. Add the corresponding handler in `sync.sideby.me` (see its contributing guide).
3. Add or update the client hook in the relevant `src/features/<feature>/hooks/` file.
4. Update any UI components that need to render the new state.
