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
2. `sync.sideby.me` runs the 7-tier dispatch pipeline and emits back a `video-change` event with a resolved `playbackUrl` and `videoType`.
3. The client's video primitives (`src/core/video/`) select the appropriate player: HLS via hls.js, YouTube iframe, or direct MP4.
4. Subsequent play/pause/seek events are coordinated via `src/features/video-sync/`.

## WebRTC

Signaling only. SDP and ICE candidates are exchanged over Socket.IO. Media flows P2P directly between browsers. WebRTC logic lives in `src/features/media/webrtc/`, with separate feature modules for voice (`src/features/media/voice/`) and video chat (`src/features/media/videochat/`).
