# Local Development

This guide explains how to run watch.sideby.me locally.

## Prerequisites

- Node.js (see `package.json` for the supported version).
- Docker (for running Redis via `docker-compose.yml`).

## Setup

1. Install dependencies:
   - `npm install` (or the package manager used by the project).
2. Start Redis:
   - `docker-compose up` from the project root (or from `watch.sideby.me` if configured there).
3. Configure environment variables:
   - Copy `.env.example` to `.env.local` and adjust values as needed (e.g. Redis URL, socket URL, any third-party keys used by the app).

## Running the app

- Start the development server using the scripts defined in `package.json`.
- The custom `server.ts` entry point wires Socket.IO into the Next.js app; follow the existing scripts/config to run it the same way in development and production.
