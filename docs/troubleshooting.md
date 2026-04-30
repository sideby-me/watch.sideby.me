# Troubleshooting

Common issues when working on watch.sideby.me.

## Socket connection issues

- Verify `NEXT_PUBLIC_SYNC_URL` points to a running `sync.sideby.me` instance.
- Check that `sync.sideby.me` has `watch.sideby.me`'s origin in its `ALLOWED_ORIGINS`.
- Look at `sync.sideby.me` server logs for connection errors.

## Video playback issues

- Video source resolution happens in `sync.sideby.me` — check its logs for `domain: 'video'` entries to see which tier the URL hit and why it may have been rejected.
- If a proxied stream fails, check `pipe.sideby.me` is running and `NEXT_PUBLIC_VIDEO_PROXY_URL` is set correctly.
- For HLS playback errors, check the browser console for hls.js errors in `src/core/video/hls-player.tsx`.

## Voice/video chat issues

- WebRTC is P2P; most issues are ICE negotiation failures.
- In production, ensure `NEXT_PUBLIC_METERED_API_KEY` is set for TURN server access.
- Check `sync.sideby.me` signaling logs for WebRTC offer/answer/ICE errors.

## Room and chat issues

- Room state is managed by `sync.sideby.me`. If members can't join, check its logs for `ROOM_LOCKED`, `PASSCODE_REQUIRED`, or `CAPACITY_EXCEEDED` error events.
- If chat messages don't appear, verify the socket is connected and check `sync.sideby.me` for Redis write errors.

## Subtitle issues

- Subtitle search calls `app/api/subtitles/search/` which proxies to OpenSubtitles. Check `OPENSUBTITLES_API_KEY` is set and the API is reachable.
