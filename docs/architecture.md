# Architecture

watch.sideby.me is a Next.js App Router application with a custom Node server that also hosts a typed Socket.IO server.

At a high level:

- The Next.js app under `app/` defines routes (e.g. `app/room/[roomId]/page.tsx`) that are kept thin and delegate to feature modules in `src/features/`.
- A custom server (`server.ts`) sets up the HTTP server, attaches Socket.IO, and wires in `server/socket`.
- Real-time features (rooms, chat, video sync, voice, video chat, subtitles) use typed Socket.IO events defined in `server/socket/types.ts` and shared types in `types/`.
- Domain logic lives in `server/services/` (e.g. `RoomService`, `ChatService`, `VideoService`, `VoiceService`, `VideoChatService`).
- Persistent state is stored in Redis via `server/redis/`, which exposes repository-style helpers for rooms, chat, and related data.
- Video URLs are resolved and classified in `server/video/resolve-source.ts`, which decides whether to play directly, via HLS, or through a proxy.

On the client:

- Feature modules under `src/features/` own user-facing experiences (room shell, chat, video sync, media/WebRTC, subtitles).
- Cross-cutting infrastructure lives under `src/core/` (socket context/hooks, logging, notifications, video primitives, configuration).
- Reusable, domain-agnostic helpers live under `src/lib/`.
