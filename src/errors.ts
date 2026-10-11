export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly code: string = "DATABASE_ERROR",
  ) {
    super(message);
    this.name = "DatabaseError";
  }

  static NotFound(message = "Record not found"): DatabaseError {
    return new DatabaseError(message, "NOT_FOUND");
  }

  static Internal(message = "Internal database error"): DatabaseError {
    return new DatabaseError(message, "INTERNAL_ERROR");
  }

  static QueryFailed(message: string): DatabaseError {
    return new DatabaseError(message, "QUERY_FAILED");
  }
}
