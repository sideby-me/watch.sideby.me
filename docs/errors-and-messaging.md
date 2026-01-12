# Errors and User Messaging

This guide explains how domain errors are modeled and surfaced to users.

## Domain errors

- All domain-specific errors extend `DomainError` from `server/errors.ts`.
- Each error has a `code` and a user-facing message, for example:
  - `NotFoundError` — "Hmm, we couldn't find what you're looking for."
  - `PermissionError` — "You don't have permission to do that."
  - `ValidationError` — "Something looks off with that request."
  - `ConflictError` — "That conflicts with something already in place."
  - `RateLimitError` — "Whoa there, slow down a bit!"
  - `RoomLockedError` — "This room is currently locked. New guests cannot join."
  - `PasscodeRequiredError` — "This room requires a passcode."
  - `CapacityError` — "Whoa, it's a full house!"

## Where errors are thrown

- Services in `server/services/` enforce business rules and throw the appropriate `DomainError` subclass.
- Socket handlers in `server/socket/handlers/` call services and let errors bubble up.

## Mapping to socket events

- The socket error handler in `server/socket` maps domain errors to typed socket error events.
- Clients receive structured error events instead of raw exception messages.

## Client UX

- Client code should convert error events into user-friendly UI:
  - Toasts or banners for transient issues.
  - Dialogs or inline messages for blocking errors (e.g. locked rooms, passcode requirements, capacity limits).
- Do not show raw error codes to users; use the friendly messages or tailored copy that matches the app's tone.
