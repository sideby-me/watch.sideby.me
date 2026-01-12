# Deployment and Operations

This guide explains how watch.sideby.me is intended to run in production.

## Build and start

- Build the app using the scripts in `package.json`.
- Start the custom server (`server.ts`) so that it:
  - Serves the Next.js app.
  - Hosts the Socket.IO server.

## Infrastructure

- Redis:
  - Required for room state, chat messages, and related data.
  - Configure connection details via environment variables.
- Environment variables:
  - Socket URL / allowed origins.
  - Any third-party keys used for subtitles or video resolution.

## Monitoring

- Use server logs (`logEvent`) to monitor room, chat, video, and media activity.
- Consider adding health checks (e.g. a lightweight endpoint) and alerts for Redis connectivity or elevated error rates.
