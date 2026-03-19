# Troubleshooting

Common issues and things to check when working on watch.sideby.me.

## Socket connection issues

- Verify the client is pointing at the correct Socket.IO URL.
- Check CORS and allowed origins for the Socket.IO server.
- Look at server logs for connection errors.

## Redis-related issues

- Ensure Redis is running and reachable.
- Check connection settings in environment variables.

## Video and media issues

- If a video URL fails to play:
  - Check the behavior of `server/video/dispatch.ts` and the Lens capture flow (`server/video/lens-client.ts`).
  - Look for logs with `domain: 'video'` indicating why a URL was rejected, which tier it hit, or whether Lens timed out.
- For voice/videochat problems:
  - Check media-related logs and any signaling errors.

## Room and chat issues

- If users cannot join a room:
  - Confirm room locks, passcodes, and capacity limits are set as expected.
  - Check for related domain errors in server logs.
- If chat messages do not appear:
  - Check socket events and Redis writes for chat flows.
