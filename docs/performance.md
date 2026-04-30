# Performance

This guide focuses on client-side performance in watch.sideby.me.

For server-side performance (dispatch pipeline, Redis, socket handlers), see [`sync.sideby.me/docs/performance.md`](https://github.com/sideby-me/sync.sideby.me/docs/performance.md).

## Client-side hotspots

- **Video sync** (`src/features/video-sync/`):
  - Sync events fire frequently during playback. Avoid unnecessary re-renders triggered by small time deltas.
  - Debounce seek emits so small scrubs don't flood the socket.
- **Media/WebRTC** (`src/features/media/`):
  - Voice and video call flows are sensitive to timing. Reconnection logic must not thrash the signaling channel.
  - Keep WebRTC state updates isolated so unrelated components don't re-render.
- **Chat** (`src/features/chat/`):
  - Message lists grow over time. Avoid re-rendering the full list on each new message.
- **Room UI** (`src/features/room/`):
  - Member list and host state updates should be efficient; the room shell renders on every socket event from `sync.sideby.me`.

## Best practices

- Prefer batched or debounced updates for high-frequency socket events.
- Use `React.memo` or stable references where re-renders are measurable.
- Log performance-relevant events (playback errors, sync corrections, WebRTC failures) so regressions are easier to spot.
