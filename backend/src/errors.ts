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

export class TopicLimitExceededError extends DomainError {
  constructor(limit: number, current: number) {
    super(
      409,
      "TOPIC_LIMIT_EXCEEDED",
      `You have reached the maximum number of tracked topics (${limit}).`,
      { limit, current },
    );
  }
}

export class DuplicateTopicNameError extends DomainError {
  constructor(name: string) {
    super(
      409,
      "DUPLICATE_TOPIC_NAME",
      `You already have a topic named "${name}".`,
    );
  }
}

export class UnknownSourceFilterError extends DomainError {
  constructor(unknownValues: string[]) {
    super(
      422,
      "UNKNOWN_SOURCE_FILTER",
      `One or more source filters are not recognized: ${unknownValues.join(", ")}.`,
      { unknownValues },
    );
  }
}

export class UnknownTopicError extends DomainError {
  constructor() {
    super(404, "NOT_FOUND", "Topic not found.");
  }
}

export class ArxivClientError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(502, "ARXIV_CLIENT_ERROR", message, details);
  }
}

export class ArxivResponseShapeError extends DomainError {
  constructor(details: unknown) {
    super(
      502,
      "ARXIV_RESPONSE_SHAPE_ERROR",
      "arXiv returned a response in an unexpected shape.",
      details,
    );
  }
}
