# Errors and User Messaging

This guide explains how the client handles errors from `sync.sideby.me` and surfaces them to users.

## How errors arrive

`sync.sideby.me` maps all domain errors to structured socket error events before sending them to the client. The client receives typed error events — not raw exceptions.

Error codes the client may receive and their default messages:

| Code                | Message                                                  |
| ------------------- | -------------------------------------------------------- |
| `NOT_FOUND`         | "Hmm, we couldn't find what you're looking for."         |
| `PERMISSION_DENIED` | "You don't have permission to do that."                  |
| `VALIDATION_ERROR`  | "Something looks off with that request."                 |
| `CONFLICT`          | "That conflicts with something already in place."        |
| `RATE_LIMITED`      | "Whoa there, slow down a bit!"                           |
| `ROOM_LOCKED`       | "This room is currently locked. New guests cannot join." |
| `PASSCODE_REQUIRED` | "This room requires a passcode."                         |
| `CAPACITY_EXCEEDED` | "Whoa, it's a full house!"                               |

The domain error model itself (how these are thrown and mapped on the server) is documented in [`sync.sideby.me/docs/errors-and-messaging.md`](https://github.com/sideby-me/sync.sideby.me/docs/errors-and-messaging.md).

## Client UX

Convert error events into appropriate UI:

- **Toasts / banners** — transient issues (rate limits, validation errors, generic failures).
- **Dialogs or inline messages** — blocking errors that require user action (locked rooms, passcode prompts, capacity limits).

Do not display raw error codes to users. Use the message strings or write tailored copy that matches the app's tone (see `ui-copy-and-language.md`).

## Logging errors on the client

Use `logDebug` or the appropriate domain logger from `src/core/logger/` when handling error events, so failures are traceable without noise in production.
