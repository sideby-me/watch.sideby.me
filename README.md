# `Sideby.me`

A feature-rich, open-source platform for synchronized watch parties. Create rooms, invite friends, & enjoy movies together in real-time.

> _what are you gonna watch btw? very sus 👀_

## What it does

TL;DR:

- Low latency, synced video streams
- Host & guest controls
- Real-time chat with reactions & markdown
- Voice & video chat (WebRTC)
- Support for multiple video sources (yt, mp4, hls)
- Upload & sync custom subtitles
- OpenSubtitles search integration
- Passcode-protected & lockable rooms

https://sideby.me/

## Getting Started

### Prerequisites

- [`Node.js 18+`](https://nodejs.org/en)
- [`Docker`](https://www.docker.com/) for Redis

### Running it Locally

**1. Environment Setup**

```bash
# Configure your environment variables
REDIS_URL=redis://localhost:6379
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000

# Optional: OpenSubtitles API
OPENSUBTITLES_API_KEY=your_api_key
```

**2. Available Scripts**

```bash
# Development with hot reload
npm run dev

# Development with Redis auto-start
npm run dev:redis

# Production build
npm run build
npm start

# Redis management
npm run redis:start    # Start Redis container
npm run redis:stop     # Stop Redis container
npm run redis:logs     # View Redis logs
npm run redis:cli      # Access Redis CLI

# Code quality
npm run lint           # ESLint check
npm run format         # Prettier format
npm run format:check   # Check formatting
```

**3. Development Workflow**

```bash
# Start your development environment
npm run dev:redis      # Starts Redis + dev server

# Optionally, in another terminal, monitor Redis
npm run redis:logs
```

### Project Structure

```
├── app/                   # app router pages
│   ├── api/               # api routes (subtitles, video-proxy)
│   ├── create/            # room creation page
│   ├── join/              # room joining page
│   └── room/[roomId]/     # watch room page
├── components/            # react components
│   ├── chat/              # chat system
│   ├── room/              # room management
│   ├── video/             # video player components
│   ├── layout/            # (core) page layout components
│   └── ui/                # (core) reusable shadcn components
├── server/                # backend server
│   ├── redis/             # redis data layer
│   └── socket/            # socket handlers
│       └── handlers/      # room, video, chat, voice, videochat
├── hooks/                 # custom hooks
├── types/                 # type definitions
└── lib/                   # utility functions
```

## Browser Extension

**Sideby Pass** — A Chrome extension that detects videos on any page and instantly creates watch rooms.

- Auto-detects videos (mp4, m3u8/HLS)
- YouTube support (watch pages & shorts)
- One-click room creation
- Right-click context menu integration

[View Extension Repo →](https://github.com/sideby-me/pass.sideby.me)

## Contributing

If you find ways to make improvements (or find one of many bugs), feel free to open an issue or a pull request or you could go touch some (gr)ass..
(or) you could keep me awake all night long? [buy me a coffee](https://buymeacoffee.com/sidebyme)
