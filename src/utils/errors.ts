/**
 * Custom Error Types for Exercise Tracker
 *
 * Provides specific error classes for different failure scenarios
 * to enable better error handling and user feedback.
 */

/**
 * Base error class for all application errors
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Resource not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string | number) {
    const message = identifier
      ? `${resource} with ID ${identifier} not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: any
  ) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

/**
 * Duplicate resource error (409)
 */
export class DuplicateError extends AppError {
  constructor(resource: string, field: string, value: any) {
    super(
      `${resource} with ${field} "${value}" already exists`,
      'DUPLICATE_ERROR',
      409
    );
  }
}

/**
 * Database operation error (500)
 */
export class DatabaseError extends AppError {
  constructor(
    message: string,
    public readonly operation?: string,
    public readonly query?: string,
    public readonly params?: any[]
  ) {
    super(message, 'DATABASE_ERROR', 500);
  }
}

/**
 * Foreign key constraint error (400)
 */
export class ConstraintError extends AppError {
  constructor(message: string, public readonly constraint: string) {
    super(message, 'CONSTRAINT_ERROR', 400);
  }
}

/**
 * File operation error (500)
 */
export class FileError extends AppError {
  constructor(
    message: string,
    public readonly operation: 'read' | 'write' | 'delete' | 'copy',
    public readonly path?: string
  ) {
    super(message, 'FILE_ERROR', 500);
  }
}

/**
 * Parse SQLite errors and convert to appropriate error types
 */
export function parseSQLiteError(error: any, operation?: string): AppError {
  const message = error?.message || String(error);

  // UNIQUE constraint violations
  if (message.includes('UNIQUE constraint failed')) {
    const match = message.match(/UNIQUE constraint failed: (\w+)\.(\w+)/);
    if (match) {
      const [, table, field] = match;
      return new DuplicateError(table, field, 'value');
    }
    return new DuplicateError('Resource', 'field', 'value');
  }

  // FOREIGN KEY constraint violations
  if (message.includes('FOREIGN KEY constraint failed')) {
    return new ConstraintError(
      'Invalid reference to related data',
      'FOREIGN_KEY'
    );
  }

  // NOT NULL constraint violations
  if (message.includes('NOT NULL constraint failed')) {
    const match = message.match(/NOT NULL constraint failed: (\w+)\.(\w+)/);
    if (match) {
      const [, , field] = match;
      return new ValidationError(`Field "${field}" is required`, field);
    }
    return new ValidationError('Required field is missing');
  }

  // CHECK constraint violations
  if (message.includes('CHECK constraint failed')) {
    return new ValidationError('Value does not meet validation criteria');
  }

  // Generic database error
  return new DatabaseError(message, operation);
}

/**
 * Type guard to check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Get user-friendly error message
 */
export function getUserMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred';
}

/**
 * Log error with context
 */
export function logError(error: unknown, context?: Record<string, any>): void {
  console.error('Error occurred:', {
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : error,
    context,
    timestamp: new Date().toISOString()
  });
}
