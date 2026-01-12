# Performance

This guide focuses on performance-sensitive areas in watch.sideby.me.

## Server-side hotspots

- **Video resolution** (`server/video/resolve-source.ts`):
  - Classifies and probes video URLs.
  - Decides whether to play directly, via HLS, or through a proxy.
  - Be mindful of external requests and timeouts when changing this code.
- **Redis usage** (`server/redis/`):
  - Stores room state, chat messages, and related data.
  - Changes here can affect latency and memory usage.
- **Services and socket handlers** (`server/services/`, `server/socket/handlers/`):
  - High-traffic events (room join/update, chat, video sync, media) should stay efficient and avoid unnecessary work.

## Client-side hotspots

- **Video sync** (`src/features/video-sync/`):
  - Frequent sync events; avoid unnecessary renders and network chatter.
- **Media/WebRTC** (`src/features/media/`):
  - Voice and videochat flows are sensitive to latency and reconnection behavior.
- **Chat and room UI** (`src/features/chat/`, `src/features/room/`):
  - Keep message lists and room state updates efficient.

## Best practices

- Avoid blocking operations in socket handlers and services.
- Prefer batched or debounced updates for high-frequency events.
- Log performance-relevant events so regressions are easier to spot.
