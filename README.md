# `watch.sideby.me`

The web frontend for Sideby.me - synchronized watch parties with real-time chat, voice/video, and multi-source video support.

> _what are you gonna watch btw? very sus 👀_

## What it does

- Synchronized video playback (YouTube, HLS, MP4)
- Real-time chat with reactions, markdown, and typing indicators
- Voice & video calls (WebRTC, P2P)
- OpenSubtitles search + custom subtitle upload
- Passcode-protected and lockable rooms
- Google Cast support

https://sideby.me/

## Architecture

This is a **frontend-only** Next.js 15 app (App Router). All real-time state lives in [`sync.sideby.me`](https://github.com/sideby-me/sync.sideby.me), a separate Socket.IO server this app connects to via `NEXT_PUBLIC_SYNC_URL`. Video proxying is handled by [`pipe.sideby.me`](https://github.com/sideby-me/pipe.sideby.me).

**OTT rooms** (`app/ott/[roomId]/`) are a separate flow for streaming-service watch parties (Netflix, etc.) that require the Chrome extension. The OTT page fetches room data from `sync.sideby.me`'s REST API, detects the extension, then redirects to the streaming service URL. It does not use Socket.IO.

## Getting Started

### Prerequisites

- Node.js 18+
- [`sync.sideby.me`](https://github.com/sideby-me/sync.sideby.me) running (Socket.IO backend)

### Environment Setup

Copy `.env.example` to `.env.local`:

```bash
NODE_ENV=development
DEPLOYMENT_ENVIRONMENT=development

# Socket.IO backend (sync.sideby.me)
NEXT_PUBLIC_SYNC_URL=http://localhost:3001

# Video proxy (pipe.sideby.me)
NEXT_PUBLIC_VIDEO_PROXY_URL=http://localhost:8787

# TURN server for production WebRTC
NEXT_PUBLIC_METERED_API_KEY=

# Subtitle search (optional)
OPENSUBTITLES_API_KEY=
```

### Running Locally

```bash
npm install
npm run dev       # Next.js dev server on http://localhost:3000
```

### Available Scripts

```bash
npm run dev           # Start dev server
npm run build         # Production build
npm start             # Run production server
npm run test          # Vitest
npm run lint          # ESLint
npm run format        # Prettier format
npm run format:check  # Check formatting
```

## Project Structure

```
├── app/                    # App Router pages
│   ├── api/
│   │   └── subtitles/      # OpenSubtitles proxy (search + download)
│   ├── create/             # Room creation page
│   ├── join/               # Join by room ID
│   ├── room/[roomId]/      # Watch room
│   ├── ott/[roomId]/       # OTT join page (Netflix etc. — extension required)
│   ├── privacy/            # Privacy policy
│   ├── terms/              # Terms of service
│   ├── cookie-policy/      # Cookie policy
│   └── legal/              # Legal overview
├── src/
│   ├── core/               # Foundation layer
│   │   ├── config/         # Theme provider, app config
│   │   ├── input/          # Keyboard shortcuts
│   │   ├── logger/         # Client-side OTEL logger
│   │   ├── notifications/  # Sound notifications
│   │   ├── socket/         # Socket.IO context + connection management
│   │   └── video/          # HLS player (hls.js), YouTube player
│   ├── features/           # Feature modules
│   │   ├── chat/           # Real-time chat, reactions, typing
│   │   ├── media/
│   │   │   ├── cast/       # Google Cast integration
│   │   │   ├── videochat/  # WebRTC video call UI
│   │   │   ├── voice/      # Voice chat UI
│   │   │   └── webrtc/     # WebRTC utilities + hooks
│   │   ├── picker/         # Media picker (source selection)
│   │   ├── room/           # Room management UI
│   │   ├── subtitles/      # Subtitle upload + search UI
│   │   └── video-sync/     # Playback sync controls
│   └── lib/
│       ├── logger.ts           # Structured JSON logger (server-side API routes)
│       ├── feature-flags.ts    # Feature flag system (NEXT_PUBLIC_FF_* env vars)
│       ├── session-storage.ts  # roomSessionStorage: host token + join data (5 min TTL)
│       ├── video-proxy-client.ts # Builds pipe.sideby.me proxy URLs
│       ├── telemetry/          # OTEL log emitter (emitWatchTelemetryLog)
│       └── video/              # URL blocklist (blocklist.ts + blocklist.json)
├── components/
│   ├── layout/             # Navigation, footer, legal layout wrapper
│   ├── pages/              # Landing page sections (hero, features, CTA)
│   └── ui/                 # shadcn/ui primitives
├── types/                  # Zod schemas for shared types
└── public/                 # Static assets
```

## Contributing

Open an issue or pull request. Or [buy me a coffee](https://buymeacoffee.com/sidebyme).
