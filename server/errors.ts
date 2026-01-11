export class DomainError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Hmm, we couldn't find what you're looking for.") {
    super('NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

export class PermissionError extends DomainError {
  constructor(message = "You don't have permission to do that.") {
    super('PERMISSION_DENIED', message);
    this.name = 'PermissionError';
  }
}

export class ValidationError extends DomainError {
  constructor(message = 'Something looks off with that request.') {
    super('VALIDATION_ERROR', message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends DomainError {
  constructor(message = 'That conflicts with something already in place.') {
    super('CONFLICT', message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends DomainError {
  constructor(message = 'Whoa there, slow down a bit!') {
    super('RATE_LIMITED', message);
    this.name = 'RateLimitError';
  }
}

export class RoomLockedError extends DomainError {
  constructor(message = 'This room is currently locked. New guests cannot join.') {
    super('ROOM_LOCKED', message);
    this.name = 'RoomLockedError';
  }
}

export class PasscodeRequiredError extends DomainError {
  constructor(public roomId: string) {
    super('PASSCODE_REQUIRED', 'This room requires a passcode.');
    this.name = 'PasscodeRequiredError';
  }
}

export class CapacityError extends DomainError {
  constructor(message = "Whoa, it's a full house!") {
    super('CAPACITY_EXCEEDED', message);
    this.name = 'CapacityError';
  }
}
