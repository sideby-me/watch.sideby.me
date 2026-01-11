import { Socket } from 'socket.io';
import {
  DomainError,
  NotFoundError,
  PermissionError,
  RoomLockedError,
  PasscodeRequiredError,
  CapacityError,
} from '../errors';
import { SocketEvents, SocketData } from './types';

type TypedSocket = Socket<SocketEvents, SocketEvents, object, SocketData>;

/**
 * Maps service errors to appropriate socket error events.
 *
 * @param err - The error thrown by a service
 * @param socket - The socket to emit the error to
 * @param defaultEvent - The default error event to use (default: 'error')
 */
export function handleServiceError(
  err: unknown,
  socket: TypedSocket,
  defaultEvent: 'error' | 'room-error' | 'voice-error' | 'videochat-error' = 'error'
): void {
  // PasscodeRequiredError is special - emit passcode-required event
  if (err instanceof PasscodeRequiredError) {
    socket.emit('passcode-required', { roomId: err.roomId });
    return;
  }

  // NotFoundError -> room-error (usually means room doesn't exist)
  if (err instanceof NotFoundError) {
    socket.emit('room-error', { error: err.message });
    return;
  }

  // RoomLockedError -> room-error
  if (err instanceof RoomLockedError) {
    socket.emit('room-error', { error: err.message });
    return;
  }

  // CapacityError -> domain-specific error event
  if (err instanceof CapacityError) {
    socket.emit(defaultEvent, { error: err.message });
    return;
  }

  // PermissionError -> generic error
  if (err instanceof PermissionError) {
    socket.emit(defaultEvent, { error: err.message });
    return;
  }

  // Other DomainErrors -> use their message
  if (err instanceof DomainError) {
    socket.emit(defaultEvent, { error: err.message });
    return;
  }

  // Unexpected errors - log and return generic message
  console.error('Unexpected service error:', err);
  socket.emit(defaultEvent, { error: 'Something tripped over the cables. Try again in a sec.' });
}
