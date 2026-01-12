# Naming and Style Guide

This guide reflects the conventions used in the current codebase.

## Components and hooks

- React components:
  - Use **PascalCase** for component names and files under `src/features` and root `components`.
  - Example: `RoomShell` in `src/features/room/components/RoomShell.tsx`.
- Hooks:
  - Use the `useSomething` prefix.
  - Use **kebab-case** filenames for hook files (e.g. `use-room-core.ts`, `use-video-sync.ts`).

## Features, core, and lib

- Features:
  - Feature folders under `src/features/` are **singular, descriptive domains** (e.g. `room`, `chat`, `video-sync`, `media`, `subtitles`).
  - Components live under `src/features/<feature>/components/`.
  - Hooks live under `src/features/<feature>/hooks/`.
- Core:
  - Cross-cutting infrastructure lives under `src/core/` (e.g. `src/core/logger`, `src/core/socket`).
- Lib:
  - Domain-agnostic helpers live under `src/lib/` and should be safe to reuse across features.

## Services, repositories, and errors

- Services:
  - Use `*Service` suffix for domain services in `server/services/` (e.g. `RoomService`, `ChatService`, `VideoService`, `VoiceService`, `VideoChatService`).
- Redis / repositories:
  - Use descriptive names for repository helpers under `server/redis/` (e.g. room, chat handlers) that reflect the state they manage.
- Errors:
  - Domain errors in `server/errors.ts` extend `DomainError` and end with `Error` (e.g. `NotFoundError`, `PermissionError`, `RoomLockedError`, `CapacityError`).

## Socket events

- Socket event names are defined and typed in `server/socket/types.ts` and shared `types/`.
- Follow the existing **kebab-case** event naming used in the codebase (e.g. `room-join`, `room-update`, `chat-message`, `video-sync`, `voice-participant-count`, `videochat-participant-count`).
- Do not invent new naming schemes; align with the existing event names and extend the typed contracts.

## Logging

- Server:
  - Use `logEvent` from `server/logger.ts` with a clear `domain`, `event`, and human-readable `message`.
- Client:
  - Use helpers from `src/core/logger` (e.g. `logRoom`, `logVideo`, `logChat`, `logVoice`, `logVideoChat`, `logSubtitles`, `logCast`, `logDebug`).

When in doubt, match the closest existing pattern in the codebase.
