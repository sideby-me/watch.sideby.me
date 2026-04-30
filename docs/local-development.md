# Local Development

This guide explains how to run watch.sideby.me locally.

## Prerequisites

- Node.js 18+
- [`sync.sideby.me`](https://github.com/sideby-me/sync.sideby.me/) running (the Socket.IO backend — see its `local-development.md`)

watch.sideby.me does not require Redis or Docker directly; those are dependencies of `sync.sideby.me`.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and configure:
   ```bash
   NEXT_PUBLIC_SYNC_URL=http://localhost:3001    # sync.sideby.me
   NEXT_PUBLIC_VIDEO_PROXY_URL=http://localhost:8787  # pipe.sideby.me (optional)
   OPENSUBTITLES_API_KEY=your_key               # optional, for subtitle search
   ```

## Running the app

```bash
npm run dev      # Next.js dev server on http://localhost:3000
```

The app connects to `sync.sideby.me` via `NEXT_PUBLIC_SYNC_URL`. Make sure `sync.sideby.me` is running first, otherwise the socket will fail to connect.

## Available scripts

```bash
npm run dev           # Development server
npm run build         # Production build
npm start             # Run production build
npm run test          # Vitest
npm run lint          # ESLint
npm run format        # Prettier
npm run format:check  # Check formatting without writing
```
