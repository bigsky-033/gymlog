/**
 * Pagination Utilities
 *
 * Reusable pagination logic for large datasets
 */

export interface PaginationParams {
  page: number;       // 0-based page index
  pageSize: number;   // Number of items per page
}

export interface PaginatedResult<T> {
  data: T[];          // Items for current page
  page: number;       // Current page (0-based)
  pageSize: number;   // Items per page
  totalItems: number; // Total number of items
  totalPages: number; // Total number of pages
  hasNext: boolean;   // Whether there's a next page
  hasPrev: boolean;   // Whether there's a previous page
}

/**
 * Default pagination settings
 */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/**
 * Validate and sanitize pagination parameters
 */
export function validatePaginationParams(
  params: Partial<PaginationParams>
): PaginationParams {
  const page = Math.max(0, params.page ?? 0);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE)
  );

  return { page, pageSize };
}

/**
 * Calculate pagination offset for SQL queries
 */
export function getPaginationOffset(params: PaginationParams): number {
  return params.page * params.pageSize;
}

/**
 * Build paginated result from data and total count
 */
export function buildPaginatedResult<T>(
  data: T[],
  params: PaginationParams,
  totalItems: number
): PaginatedResult<T> {
  const totalPages = Math.ceil(totalItems / params.pageSize);

  return {
    data,
    page: params.page,
    pageSize: params.pageSize,
    totalItems,
    totalPages,
    hasNext: params.page < totalPages - 1,
    hasPrev: params.page > 0
  };
}

/**
 * Generate SQL LIMIT/OFFSET clause
 */
export function getPaginationSQL(params: PaginationParams): {
  sql: string;
  params: number[];
} {
  const offset = getPaginationOffset(params);
  return {
    sql: 'LIMIT ? OFFSET ?',
    params: [params.pageSize, offset]
  };
}

/**
 * Helper for cursor-based pagination (alternative to offset)
 * More efficient for large datasets
 */
export interface CursorPaginationParams {
  cursor?: string | number;  // Last item ID from previous page
  pageSize: number;
}

export interface CursorPaginatedResult<T> {
  data: T[];
  nextCursor?: string | number;
  hasNext: boolean;
}

/**
 * Build cursor-based SQL WHERE clause
 */
export function getCursorSQL(
  cursorField: string,
  cursor?: string | number,
  direction: 'ASC' | 'DESC' = 'DESC'
): {
  sql: string;
  params: (string | number)[];
} {
  if (!cursor) {
    return { sql: '', params: [] };
  }

  const operator = direction === 'DESC' ? '<' : '>';
  return {
    sql: `${cursorField} ${operator} ?`,
    params: [cursor]
  };
}

/**
 * Extract next cursor from result set
 */
export function getNextCursor<T>(
  data: T[],
  cursorField: keyof T
): string | number | undefined {
  if (data.length === 0) return undefined;
  const lastItem = data[data.length - 1];
  return lastItem[cursorField] as string | number;
}
