# File Structure

This is a high-level overview of the watch.sideby.me file structure as implemented today.

- `app/`
  - Next.js App Router entrypoints. Routes are generally thin and delegate to feature modules in `src/features/` (for example, `app/room/[roomId]/page.tsx` renders the `RoomShell` from `src/features/room`).
- `components/`
  - Generic layout and UI components shared across the app (e.g. `components/layout/*`, `components/ui/*`). Domain-specific UI lives under `src/features/` instead.
- `server/`
  - `errors.ts` — domain error types used by services and socket handlers.
  - `logger.ts` — structured server-side logging (`logEvent`) with domains such as `room`, `video`, `chat`, `voice`, `videochat`, `subtitles`, `other`.
  - `redis/` — Redis client and repository-like helpers for rooms, chat, and related state.
  - `services/` — domain services for rooms, chat, video, voice, and video chat.
  - `socket/` — Socket.IO setup, typed event contracts, and per-domain handlers.
  - `video/` — video source resolution and proxying.
- `src/core/`
  - Cross-cutting client infrastructure: socket provider/hooks, client logger, notifications, video primitives, configuration, and other app-wide utilities.
- `src/features/`
  - Feature modules for room, chat, video sync, media (voice/videochat/WebRTC), subtitles, etc. Each feature owns its components and hooks.
- `src/lib/`
  - Domain-agnostic utility functions and helpers imported by features and core.
- `types/`
  - Shared TypeScript types and schemas (including socket event contracts) used by both client and server.
