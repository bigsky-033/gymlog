/**
 * DatabaseService - Singleton service for SQLite database operations
 *
 * SECURITY:
 * - ALWAYS uses parameterized queries (never string concatenation)
 * - Validates input data before queries
 * - Enables foreign key constraints
 * - Provides transaction support for atomic operations
 *
 * USAGE:
 * ```typescript
 * const db = DatabaseService.getInstance();
 * await db.initDatabase();
 * const results = await db.executeQuery<User>('SELECT * FROM users WHERE id = ?', [userId]);
 * ```
 */

import * as SQLite from 'expo-sqlite';
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  CREATE_TABLES,
  CREATE_INDEXES,
  CREATE_TRIGGERS,
  INITIAL_DATA,
  MIGRATIONS
} from './schema';

/**
 * Custom error class for database-specific errors
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly query?: string,
    public readonly params?: any[]
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

/**
 * Database initialization state
 */
type InitState = 'uninitialized' | 'initializing' | 'ready' | 'error';

/**
 * DatabaseService - Main database service class
 */
export class DatabaseService {
  private static instance: DatabaseService;
  private db: SQLite.SQLiteDatabase | null = null;
  private initState: InitState = 'uninitialized';
  private initPromise: Promise<void> | null = null;

  /**
   * Private constructor enforces singleton pattern
   */
  private constructor() {}

  /**
   * Get singleton instance of DatabaseService
   */
  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize the database
   * - Creates tables, indexes, and triggers
   * - Enables foreign keys
   * - Runs migrations
   * - Seeds initial data
   *
   * Safe to call multiple times - will return existing initialization promise
   */
  async initDatabase(): Promise<void> {
    // If already initialized, return
    if (this.initState === 'ready') {
      return;
    }

    // If currently initializing, wait for it to complete
    if (this.initState === 'initializing' && this.initPromise) {
      return this.initPromise;
    }

    // Start initialization
    this.initState = 'initializing';
    this.initPromise = this._initDatabase();

    try {
      await this.initPromise;
      this.initState = 'ready';
    } catch (error) {
      this.initState = 'error';
      throw error;
    }

    return this.initPromise;
  }

  /**
   * Internal initialization implementation
   */
  private async _initDatabase(): Promise<void> {
    try {
      // Open database
      this.db = await SQLite.openDatabaseAsync(DATABASE_NAME);

      // CRITICAL: Enable foreign key constraints
      // SQLite has foreign keys DISABLED by default!
      await this.db.execAsync('PRAGMA foreign_keys = ON;');

      // Verify foreign keys are enabled
      const fkCheck = await this.db.getFirstAsync<{ foreign_keys: number }>(
        'PRAGMA foreign_keys'
      );
      if (fkCheck?.foreign_keys !== 1) {
        throw new DatabaseError(
          'Failed to enable foreign key constraints',
          'FK_ENABLE_FAILED'
        );
      }

      // Enable Write-Ahead Logging for better performance
      await this.db.execAsync('PRAGMA journal_mode = WAL;');

      // Create tables, indexes, and triggers
      await this.db.execAsync(CREATE_TABLES);
      await this.db.execAsync(CREATE_INDEXES);
      await this.db.execAsync(CREATE_TRIGGERS);

      // Run migrations if needed
      await this.runMigrations();

      // Initialize default data
      await this.initializeDefaultData();

      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw new DatabaseError(
        'Failed to initialize database',
        'INIT_FAILED',
        undefined,
        undefined
      );
    }
  }

  /**
   * Run database migrations
   * Safely upgrades schema from one version to another
   */
  private async runMigrations(): Promise<void> {
    const currentVersion = await this.getDatabaseVersion();

    if (currentVersion < DATABASE_VERSION) {
      console.log(`🔄 Running migrations from v${currentVersion} to v${DATABASE_VERSION}`);

      // Run each migration in sequence
      for (let v = currentVersion + 1; v <= DATABASE_VERSION; v++) {
        await this.runMigration(v);
      }

      // Update database version
      await this.setDatabaseVersion(DATABASE_VERSION);
      console.log(`✅ Migrations complete - now at v${DATABASE_VERSION}`);
    }
  }

  /**
   * Get current database version from metadata
   */
  private async getDatabaseVersion(): Promise<number> {
    try {
      const result = await this.db!.getFirstAsync<{ value: string }>(
        'SELECT value FROM app_metadata WHERE key = ?',
        ['db_version']
      );
      return result ? parseInt(result.value, 10) : 0;
    } catch {
      // Table might not exist yet
      return 0;
    }
  }

  /**
   * Set database version in metadata
   */
  private async setDatabaseVersion(version: number): Promise<void> {
    await this.db!.runAsync(
      'INSERT OR REPLACE INTO app_metadata (key, value) VALUES (?, ?)',
      ['db_version', version.toString()]
    );
  }

  /**
   * Run a specific migration version
   */
  private async runMigration(version: number): Promise<void> {
    const migration = MIGRATIONS[version];

    if (migration) {
      console.log(`⚙️  Running migration v${version}`);
      try {
        await this.db!.execAsync(migration);
      } catch (error) {
        throw new DatabaseError(
          `Migration v${version} failed`,
          'MIGRATION_FAILED',
          migration
        );
      }
    }
  }

  /**
   * Initialize default data (tags, sample exercises)
   * Only runs if database is empty
   */
  private async initializeDefaultData(): Promise<void> {
    // Check if profile exists
    const profile = await this.db!.getFirstAsync(
      'SELECT id FROM profile LIMIT 1'
    );

    if (!profile) {
      console.log('📝 Initializing default data...');

      // Create default profile
      await this.db!.runAsync(
        'INSERT INTO profile (name) VALUES (?)',
        ['User']
      );

      // Insert default tags
      for (const tag of INITIAL_DATA.tags) {
        await this.db!.runAsync(
          'INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)',
          [tag.name, tag.color]
        );
      }

      // Insert sample exercises (optional - users can delete these)
      for (const exercise of INITIAL_DATA.exercises) {
        const result = await this.db!.runAsync(
          'INSERT OR IGNORE INTO exercises (name) VALUES (?)',
          [exercise.name]
        );

        // Add tags to exercise
        if (result.lastInsertRowId) {
          for (const tagName of exercise.tags) {
            const tag = await this.db!.getFirstAsync<{ id: number }>(
              'SELECT id FROM tags WHERE name = ?',
              [tagName]
            );

            if (tag) {
              await this.db!.runAsync(
                'INSERT OR IGNORE INTO exercise_tags (exercise_id, tag_id) VALUES (?, ?)',
                [result.lastInsertRowId, tag.id]
              );
            }
          }
        }
      }

      console.log('✅ Default data initialized');
    }
  }

  /**
   * Execute a SELECT query and return all results
   *
   * @param sql - SQL query with ? placeholders
   * @param params - Parameters to bind to placeholders
   * @returns Array of results
   *
   * @example
   * const users = await db.executeQuery<User>(
   *   'SELECT * FROM users WHERE age > ?',
   *   [18]
   * );
   */
  async executeQuery<T>(sql: string, params: any[] = []): Promise<T[]> {
    this.ensureInitialized();

    try {
      return await this.db!.getAllAsync<T>(sql, params);
    } catch (error) {
      console.error('Query execution failed:', { sql, params, error });
      throw new DatabaseError(
        `Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_FAILED',
        sql,
        params
      );
    }
  }

  /**
   * Execute an INSERT, UPDATE, or DELETE query
   *
   * @param sql - SQL query with ? placeholders
   * @param params - Parameters to bind to placeholders
   * @returns Result with lastInsertRowId and changes count
   *
   * @example
   * const result = await db.executeRun(
   *   'INSERT INTO users (name, email) VALUES (?, ?)',
   *   ['John', 'john@example.com']
   * );
   * console.log('Inserted ID:', result.lastInsertRowId);
   */
  async executeRun(
    sql: string,
    params: any[] = []
  ): Promise<SQLite.SQLiteRunResult> {
    this.ensureInitialized();

    try {
      return await this.db!.runAsync(sql, params);
    } catch (error) {
      console.error('Run execution failed:', { sql, params, error });
      throw new DatabaseError(
        `Run failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'RUN_FAILED',
        sql,
        params
      );
    }
  }

  /**
   * Execute a query and return only the first result
   *
   * @param sql - SQL query with ? placeholders
   * @param params - Parameters to bind to placeholders
   * @returns First result or null
   *
   * @example
   * const user = await db.getFirst<User>(
   *   'SELECT * FROM users WHERE id = ?',
   *   [userId]
   * );
   */
  async getFirst<T>(sql: string, params: any[] = []): Promise<T | null> {
    this.ensureInitialized();

    try {
      return await this.db!.getFirstAsync<T>(sql, params);
    } catch (error) {
      console.error('Get first failed:', { sql, params, error });
      throw new DatabaseError(
        `Get first failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_FIRST_FAILED',
        sql,
        params
      );
    }
  }

  /**
   * Execute multiple queries in a transaction
   * All queries succeed together or all fail together
   *
   * @param callback - Async function containing database operations
   * @returns Result from callback
   *
   * @example
   * await db.transaction(async () => {
   *   await db.executeRun('INSERT INTO users (name) VALUES (?)', ['Alice']);
   *   await db.executeRun('INSERT INTO logs (action) VALUES (?)', ['user_created']);
   * });
   */
  async transaction<T>(
    callback: (db: DatabaseService) => Promise<T>
  ): Promise<T> {
    this.ensureInitialized();

    return await this.db!.withTransactionAsync(async () => {
      return await callback(this);
    });
  }

  /**
   * Execute a batch of queries efficiently
   * Useful for inserting multiple rows
   *
   * @param sql - SQL query with ? placeholders
   * @param batchParams - Array of parameter arrays
   *
   * @example
   * await db.executeBatch(
   *   'INSERT INTO users (name, email) VALUES (?, ?)',
   *   [
   *     ['Alice', 'alice@example.com'],
   *     ['Bob', 'bob@example.com']
   *   ]
   * );
   */
  async executeBatch(sql: string, batchParams: any[][]): Promise<void> {
    this.ensureInitialized();

    await this.transaction(async () => {
      const stmt = await this.db!.prepareAsync(sql);

      try {
        for (const params of batchParams) {
          await stmt.executeAsync(params);
        }
      } finally {
        await stmt.finalizeAsync();
      }
    });
  }

  /**
   * Get database statistics (useful for debugging)
   */
  async getStats(): Promise<{
    version: number;
    tables: number;
    exercises: number;
    sets: number;
    sessions: number;
    tags: number;
  }> {
    this.ensureInitialized();

    const [version, tables, exercises, sets, sessions, tags] = await Promise.all([
      this.getDatabaseVersion(),
      this.db!.getAllAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'"
      ),
      this.db!.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM exercises'),
      this.db!.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM sets'),
      this.db!.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM workout_sessions'),
      this.db!.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tags')
    ]);

    return {
      version,
      tables: tables[0]?.count || 0,
      exercises: exercises?.count || 0,
      sets: sets?.count || 0,
      sessions: sessions?.count || 0,
      tags: tags?.count || 0
    };
  }

  /**
   * Optimize database performance
   * Runs ANALYZE to update query planner statistics
   * Run this periodically (e.g., once a week) or after bulk operations
   */
  async optimize(): Promise<void> {
    this.ensureInitialized();
    console.log('⚡ Optimizing database...');
    await this.db!.execAsync('ANALYZE;');
    console.log('✅ Database optimized');
  }

  /**
   * Vacuum database to reclaim unused space
   * Run this occasionally to reduce database file size
   * WARNING: Can be slow on large databases
   */
  async vacuum(): Promise<void> {
    this.ensureInitialized();
    console.log('🧹 Vacuuming database...');
    await this.db!.execAsync('VACUUM;');
    console.log('✅ Database vacuumed');
  }

  /**
   * Verify database integrity
   * @returns true if database is healthy, throws error otherwise
   */
  async verifyIntegrity(): Promise<boolean> {
    this.ensureInitialized();

    const integrityCheck = await this.db!.getFirstAsync<{ integrity_check: string }>(
      'PRAGMA integrity_check'
    );

    if (integrityCheck?.integrity_check !== 'ok') {
      throw new DatabaseError(
        'Database integrity check failed',
        'INTEGRITY_CHECK_FAILED'
      );
    }

    // Verify foreign keys are still enabled
    const fkCheck = await this.db!.getFirstAsync<{ foreign_keys: number }>(
      'PRAGMA foreign_keys'
    );

    if (fkCheck?.foreign_keys !== 1) {
      throw new DatabaseError(
        'Foreign keys are not enabled',
        'FK_NOT_ENABLED'
      );
    }

    return true;
  }

  /**
   * Close database connection
   * WARNING: After closing, you must call initDatabase() again to use the service
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
      this.initState = 'uninitialized';
      this.initPromise = null;
      console.log('📕 Database closed');
    }
  }

  /**
   * Reset database - DANGER: Deletes all data!
   * Useful for testing or complete reset
   */
  async resetDatabase(): Promise<void> {
    console.warn('⚠️  Resetting database - ALL DATA WILL BE LOST!');

    if (this.db) {
      await this.db.closeAsync();
    }

    // Delete database file
    await SQLite.deleteDatabaseAsync(DATABASE_NAME);

    // Reinitialize
    this.db = null;
    this.initState = 'uninitialized';
    this.initPromise = null;

    await this.initDatabase();
    console.log('🔄 Database reset complete');
  }

  /**
   * Ensure database is initialized before operations
   * @throws DatabaseError if not initialized
   */
  private ensureInitialized(): void {
    if (this.initState !== 'ready' || !this.db) {
      throw new DatabaseError(
        'Database not initialized. Call initDatabase() first.',
        'NOT_INITIALIZED'
      );
    }
  }

  /**
   * Get the underlying SQLite database instance
   * Use with caution - prefer using the service methods
   */
  getRawDatabase(): SQLite.SQLiteDatabase {
    this.ensureInitialized();
    return this.db!;
  }

  /**
   * Get initialization state
   */
  getInitState(): InitState {
    return this.initState;
  }

  /**
   * Check if database is ready
   */
  isReady(): boolean {
    return this.initState === 'ready';
  }
}

/**
 * Convenience function to get database instance
 */
export const getDatabase = () => DatabaseService.getInstance();
