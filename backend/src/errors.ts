export class DomainError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class DuplicateEmailError extends DomainError {
  constructor() {
    super(409, "DUPLICATE_EMAIL", "Email is already registered.");
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor(message = "Invalid email or password.") {
    super(401, "INVALID_CREDENTIALS", message);
  }
}

export class AuthRequiredError extends DomainError {
  constructor() {
    super(401, "AUTH_REQUIRED", "Authentication required.");
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Not found.") {
    super(404, "NOT_FOUND", message);
  }
}

export class ValidationFailedError extends DomainError {
  constructor(details: unknown) {
    super(400, "VALIDATION_FAILED", "Validation failed.", details);
  }
}
