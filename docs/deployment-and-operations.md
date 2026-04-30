# Deployment and Operations

This guide explains how watch.sideby.me runs in production.

## Build and start

```bash
npm run build
npm start
```

watch.sideby.me is a standard Next.js application. There is no custom server entry point.

## Infrastructure

watch.sideby.me itself has no runtime dependencies beyond Node.js. It needs:

- **`sync.sideby.me`** running and reachable — set `NEXT_PUBLIC_SYNC_URL` to its URL.
- **`pipe.sideby.me`** for proxied video streams — set `NEXT_PUBLIC_VIDEO_PROXY_URL` to its URL.

Redis and all socket/room state are managed by `sync.sideby.me`. watch.sideby.me does not connect to Redis directly.

## Environment variables

```bash
NEXT_PUBLIC_SYNC_URL=https://sync.sideby.me
NEXT_PUBLIC_VIDEO_PROXY_URL=https://pipe.sideby.me
NEXT_PUBLIC_METERED_API_KEY=your_turn_key    # TURN server for production WebRTC
OPENSUBTITLES_API_KEY=your_key               # optional
```

## Monitoring

- Client-side logs are emitted via `src/core/logger/` and forwarded to OTEL if configured.
- Monitor `sync.sideby.me` for room/chat/video errors — that's where the action is.
- Watch for Next.js build errors and failed subtitle API calls (`app/api/subtitles/`).
