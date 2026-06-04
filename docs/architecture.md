# Architecture

watch.sideby.me is a Next.js 15 App Router application. It is a **frontend-only** service — there is no custom server, no Socket.IO server, and no Redis. All real-time state and room logic live in [`sync.sideby.me`](https://github.com/sideby-me/sync.sideby.me/).

At a high level:

- Routes in `app/` are thin shells that delegate to feature modules in `src/features/`.
- Real-time features connect to `sync.sideby.me` via a Socket.IO client context in `src/core/socket/`. The `SocketProvider` wraps the app and exposes a `useSocket()` hook.
- Socket event contracts are typed via `SocketEvents` (defined in `types/`) so the client stays in sync with the backend.
- Feature modules under `src/features/` own user-facing experiences: room shell, chat, video sync, media/WebRTC, subtitles, and the video picker.
- Cross-cutting infrastructure lives under `src/core/`: socket provider, client logger, notification sounds, video player primitives (HLS + YouTube), keyboard shortcuts, and app config.
- Domain-agnostic utilities live under `src/lib/`.
- The only server-side API routes are under `app/api/subtitles/` (OpenSubtitles search and download proxy).

## How video playback works (client side)

Video source resolution happens in `sync.sideby.me`. When a video URL is set in a room:

1. The client emits a `set-video` event over Socket.IO.
2. `sync.sideby.me` runs the 7-tier dispatch pipeline and emits back a `video-set` event with a resolved `videoUrl`, `videoType`, and optional `videoMeta`.
3. The client's video primitives (`src/core/video/`) select the appropriate player: HLS via hls.js, YouTube iframe, or direct MP4.
4. Subsequent play/pause/seek events are coordinated via `src/features/video-sync/`.

When the dispatch results in a Lens capture with low confidence, sync emits `picker-required` to the host socket only. The host sees a `PickerOverlay` (`src/features/picker/`) that lets them select the correct stream; their choice is sent back via `picker-select`.

If a Lens-captured URL later goes stale (4xx on a `uuid=` pipe URL), the client emits `video-stale` to trigger reactive re-extraction. The daemon-triggered refresh path emits `video-url-refresh` from the server.

## OTT rooms

Rooms with `roomType: 'ott'` are for streaming-service watch parties (Netflix, etc.) that require the Chrome extension. The flow lives entirely in `app/ott/[roomId]/page.tsx`:

1. The page fetches room data from `sync.sideby.me`'s REST API (`/api/rooms/:roomId`) — no socket connection.
2. It detects the Chrome extension by checking `document.documentElement.dataset.sidebyExt === '1'`.
3. When both are ready, it fires a `sideby:ott-join` CustomEvent (so the extension arms its pending-join state) and immediately does a `router.replace` to the OTT URL with the room ID appended as `?sideby_room=`.
4. If the extension is missing, it shows an install CTA.

OTT rooms never go through the normal `room/[roomId]` route or the Socket.IO video pipeline.

## WebRTC

Signaling only. SDP and ICE candidates are exchanged over Socket.IO. Media flows P2P directly between browsers. WebRTC logic lives in `src/features/media/webrtc/`, with separate feature modules for voice (`src/features/media/voice/`) and video chat (`src/features/media/videochat/`).
