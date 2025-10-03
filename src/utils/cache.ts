/**
 * Caching Layer with Auto-Invalidation
 *
 * Simple in-memory cache for frequently accessed data
 * Automatically invalidates related cache entries on write operations
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

export class CacheManager {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private dependencies: Map<string, Set<string>> = new Map();

  /**
   * Default TTL: 5 minutes
   */
  private readonly DEFAULT_TTL = 5 * 60 * 1000;

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Get or fetch value (cache-aside pattern)
   */
  async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Check cache first
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch and cache
    const data = await fetchFn();
    this.set(key, data, ttl);
    return data;
  }

  /**
   * Invalidate specific cache key
   */
  invalidate(key: string): void {
    this.cache.delete(key);

    // Also invalidate dependent keys
    const deps = this.dependencies.get(key);
    if (deps) {
      deps.forEach(depKey => this.cache.delete(depKey));
    }
  }

  /**
   * Invalidate all keys matching a pattern
   */
  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    const keysToDelete: string[] = [];

    this.cache.forEach((_, key) => {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.invalidate(key));
  }

  /**
   * Define cache dependencies
   * When parentKey is invalidated, childKeys are also invalidated
   */
  addDependency(parentKey: string, ...childKeys: string[]): void {
    if (!this.dependencies.has(parentKey)) {
      this.dependencies.set(parentKey, new Set());
    }

    const deps = this.dependencies.get(parentKey)!;
    childKeys.forEach(key => deps.add(key));
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.dependencies.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    keys: string[];
    dependencies: number;
  } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      dependencies: this.dependencies.size
    };
  }

  /**
   * Remove expired entries (garbage collection)
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

/**
 * Singleton cache instance
 */
export const cache = new CacheManager();

/**
 * Cache key builders for consistent naming
 */
export const CacheKeys = {
  // Exercises
  allExercises: () => 'exercises:all',
  exerciseById: (id: number) => `exercises:${id}`,
  exercisesByTag: (tagId: number) => `exercises:tag:${tagId}`,
  recentExercises: () => 'exercises:recent',
  favoriteExercises: () => 'exercises:favorites',

  // Tags
  allTags: () => 'tags:all',
  tagById: (id: number) => `tags:${id}`,

  // Workout Sessions
  sessionById: (id: number) => `sessions:${id}`,
  sessionsByDate: (date: string) => `sessions:date:${date}`,
  sessionsByDateRange: (start: string, end: string) => `sessions:range:${start}:${end}`,
  calendarMarkers: (year: number, month: number) => `calendar:${year}:${month}`,

  // Sets
  setsBySession: (sessionId: number) => `sets:session:${sessionId}`,
  setsByExercise: (exerciseId: number) => `sets:exercise:${exerciseId}`,

  // Profile
  profile: () => 'profile'
} as const;

/**
 * Cache invalidation strategies for write operations
 */
export const CacheInvalidation = {
  /**
   * Invalidate when exercise is created/updated/deleted
   */
  onExerciseChange: (exerciseId?: number) => {
    cache.invalidatePattern('exercises:');
    if (exerciseId) {
      cache.invalidate(CacheKeys.exerciseById(exerciseId));
      cache.invalidate(CacheKeys.setsByExercise(exerciseId));
    }
  },

  /**
   * Invalidate when tag is created/updated/deleted
   */
  onTagChange: (tagId?: number) => {
    cache.invalidatePattern('tags:');
    cache.invalidatePattern('exercises:'); // Exercises include tags
    if (tagId) {
      cache.invalidate(CacheKeys.tagById(tagId));
      cache.invalidate(CacheKeys.exercisesByTag(tagId));
    }
  },

  /**
   * Invalidate when workout session is created/updated/deleted
   */
  onSessionChange: (sessionId?: number, date?: string) => {
    cache.invalidatePattern('sessions:');
    cache.invalidatePattern('calendar:');
    if (sessionId) {
      cache.invalidate(CacheKeys.sessionById(sessionId));
      cache.invalidate(CacheKeys.setsBySession(sessionId));
    }
    if (date) {
      cache.invalidate(CacheKeys.sessionsByDate(date));
    }
  },

  /**
   * Invalidate when set is created/updated/deleted
   */
  onSetChange: (sessionId: number, exerciseId: number) => {
    cache.invalidate(CacheKeys.setsBySession(sessionId));
    cache.invalidate(CacheKeys.setsByExercise(exerciseId));
    cache.invalidate(CacheKeys.recentExercises());
    cache.invalidate(CacheKeys.sessionById(sessionId));
  },

  /**
   * Invalidate when profile is updated
   */
  onProfileChange: () => {
    cache.invalidate(CacheKeys.profile());
  }
} as const;

/**
 * Auto-cleanup interval (run every 10 minutes)
 */
let cleanupInterval: NodeJS.Timeout | null = null;

export function startCacheCleanup(intervalMs: number = 10 * 60 * 1000): void {
  if (cleanupInterval) {
    return; // Already running
  }

  cleanupInterval = setInterval(() => {
    cache.cleanup();
  }, intervalMs);
}

export function stopCacheCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
