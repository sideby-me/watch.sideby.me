# Naming and Style Guide

This guide reflects the frontend conventions used in watch.sideby.me.

For server-side naming conventions (services, Redis handlers, socket handlers), see [`sync.sideby.me/docs/naming-and-style-guide.md`](https://github.com/sideby-me/sync.sideby.me/docs/naming-and-style-guide.md).

## Components and hooks

- React components: **PascalCase** for component names and files.
  - Example: `RoomShell` in `src/features/room/components/RoomShell.tsx`.
- Hooks: `useSomething` prefix, **kebab-case** filenames.
  - Example: `use-room-core.ts`, `use-video-sync.ts`.

## Features, core, and lib

- Feature folders under `src/features/` use **singular, descriptive domain names** (e.g. `room`, `chat`, `video-sync`, `media`, `subtitles`).
  - Components: `src/features/<feature>/components/`
  - Hooks: `src/features/<feature>/hooks/`
- Cross-cutting infrastructure: `src/core/` (e.g. `src/core/logger`, `src/core/socket`).
- Reusable utilities: `src/lib/` — safe to import from any feature.

## Socket events

- Event names are defined in `types/` (`SocketEvents`) and follow **kebab-case** (e.g. `room-join`, `chat-message`, `video-sync`, `voice-participant-count`).
- Do not invent untyped string literals; always extend `SocketEvents`.

## Client logging

- Use helpers from `src/core/logger/` (`logRoom`, `logVideo`, `logChat`, etc.).
- Never use raw `console.log` in shipped code.

When in doubt, match the closest existing pattern in the codebase.
