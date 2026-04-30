# File Structure

This is a high-level overview of the watch.sideby.me file structure as implemented today.

- `app/`
  - Next.js App Router routes. Kept thin; delegate to `src/features/` (e.g. `app/room/[roomId]/page.tsx` renders `RoomShell` from `src/features/room`).
  - `app/api/subtitles/` — OpenSubtitles proxy (search + download).
  - Legal pages: `privacy`, `terms`, `cookie-policy`, `legal`.
- `components/`
  - Generic layout and UI components shared across the app (`components/layout/*`, `components/ui/*`). Domain-specific UI lives under `src/features/` instead.
- `src/core/`
  - Cross-cutting client infrastructure:
    - `socket/` — `SocketProvider`, `useSocket()` hook, Socket.IO connection management.
    - `logger/` — Client-side structured logging helpers (`logRoom`, `logVideo`, `logChat`, etc.).
    - `video/` — HLS player (hls.js), YouTube iframe player.
    - `config/` — Theme provider, app-wide configuration.
    - `input/` — Keyboard shortcut handling.
    - `notifications/` — Sound notification system.
- `src/features/`
  - Feature modules, each owning its own components and hooks:
    - `room/` — Room shell, member list, host controls.
    - `chat/` — Real-time chat, reactions, typing indicators.
    - `video-sync/` — Playback sync controls (play/pause/seek/speed).
    - `media/`
      - `videochat/` — WebRTC video call UI.
      - `voice/` — Voice chat UI.
      - `webrtc/` — WebRTC hooks and utilities.
      - `cast/` — Google Cast integration.
    - `picker/` — Video source picker UI.
    - `subtitles/` — Subtitle upload and OpenSubtitles search.
- `src/lib/`
  - Domain-agnostic utility functions:
    - `telemetry/` — OTEL client setup.
    - `video/` — Video URL utilities and helpers.
- `types/`
  - Zod schemas and TypeScript types for socket event contracts and shared data structures.
- `public/`
  - Static assets.
