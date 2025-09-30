/**
 * SQLite Database Schema for Exercise Tracker
 *
 * IMPORTANT CONVENTIONS:
 * - All dates/timestamps stored as ISO 8601 strings in UTC
 * - Booleans stored as INTEGER (0 = false, 1 = true)
 * - Foreign keys MUST be enabled with: PRAGMA foreign_keys = ON;
 * - Use COLLATE NOCASE for case-insensitive text comparisons
 */

export const DATABASE_VERSION = 1;
export const DATABASE_NAME = 'exercise_tracker.db';

// Complete schema creation SQL
export const CREATE_TABLES = `
  -- Profile/Settings table
  -- Stores user preferences and app configuration
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    weight_unit TEXT DEFAULT 'kg' CHECK(weight_unit IN ('kg', 'lbs')),
    week_starts_on TEXT DEFAULT 'monday' CHECK(week_starts_on IN ('monday', 'sunday')),
    locale TEXT DEFAULT 'en' CHECK(locale IN ('en', 'ko')),
    timezone TEXT DEFAULT 'UTC',
    default_rest_timer INTEGER DEFAULT 90,
    auto_backup_enabled INTEGER DEFAULT 0 CHECK(auto_backup_enabled IN (0, 1)),
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  -- Exercise definitions
  -- Stores exercise templates with default values
  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    notes TEXT,
    default_weight REAL,
    default_reps INTEGER,
    unit TEXT DEFAULT 'kg' CHECK(unit IN ('kg', 'lbs')),
    is_favorite INTEGER DEFAULT 0 CHECK(is_favorite IN (0, 1)),
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  -- Tags/Labels for exercises (e.g., "Squat 박재훈 버전", "Legs", "Compound")
  -- Supports exercise variations and categorization
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color TEXT DEFAULT '#007AFF',
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  -- Many-to-many relationship for exercises and tags
  -- Allows multiple tags per exercise (e.g., "Squat" can have "Legs", "Compound", "박재훈 버전")
  CREATE TABLE IF NOT EXISTS exercise_tags (
    exercise_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (exercise_id, tag_id)
  );

  -- Workout sessions (typically one per day, but can have multiple with time_of_day)
  CREATE TABLE IF NOT EXISTS workout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time_of_day TEXT CHECK(time_of_day IN ('morning', 'afternoon', 'evening') OR time_of_day IS NULL),
    duration_minutes INTEGER,
    notes TEXT,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(date, time_of_day)
  );

  -- Individual sets within a workout
  -- Supports warm-up sets, failed reps, and 0.5kg increments
  CREATE TABLE IF NOT EXISTS sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    weight REAL NOT NULL CHECK(weight >= 0),
    reps INTEGER NOT NULL CHECK(reps >= 0),
    is_warmup INTEGER DEFAULT 0 CHECK(is_warmup IN (0, 1)),
    is_failure INTEGER DEFAULT 0 CHECK(is_failure IN (0, 1)),
    rest_duration_seconds INTEGER,
    notes TEXT,
    set_order INTEGER NOT NULL,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id)
  );

  -- Track recently used exercises for quick access
  -- Auto-updated via trigger when sets are added
  CREATE TABLE IF NOT EXISTS recent_exercises (
    exercise_id INTEGER PRIMARY KEY,
    last_used TEXT NOT NULL,
    use_count INTEGER DEFAULT 1,
    last_weight REAL,
    last_reps INTEGER,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
  );

  -- Store app metadata (db version, settings, etc.)
  CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`;

// Indexes for performance optimization
// IMPORTANT: SQLite doesn't automatically index foreign keys
export const CREATE_INDEXES = `
  -- Sets table indexes (most frequently queried)
  CREATE INDEX IF NOT EXISTS idx_sets_session_id ON sets(session_id);
  CREATE INDEX IF NOT EXISTS idx_sets_exercise_id ON sets(exercise_id);
  CREATE INDEX IF NOT EXISTS idx_sets_created_at ON sets(created_at);

  -- Covering index for common query pattern: get sets by session and exercise
  CREATE INDEX IF NOT EXISTS idx_sets_session_exercise ON sets(session_id, exercise_id);

  -- Workout sessions index for calendar view
  CREATE INDEX IF NOT EXISTS idx_workout_sessions_date ON workout_sessions(date);

  -- Exercise tags indexes for filtering
  CREATE INDEX IF NOT EXISTS idx_exercise_tags_exercise ON exercise_tags(exercise_id);
  CREATE INDEX IF NOT EXISTS idx_exercise_tags_tag ON exercise_tags(tag_id);

  -- Recent exercises index for quick access
  CREATE INDEX IF NOT EXISTS idx_recent_exercises_last_used ON recent_exercises(last_used DESC);

  -- Exercise name index for search
  CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name COLLATE NOCASE);

  -- Favorite exercises index for quick filtering
  CREATE INDEX IF NOT EXISTS idx_exercises_favorite ON exercises(is_favorite) WHERE is_favorite = 1;
`;

// Triggers for automatic updates and data consistency
export const CREATE_TRIGGERS = `
  -- Auto-update profile timestamp on any update
  CREATE TRIGGER IF NOT EXISTS update_profile_timestamp
  AFTER UPDATE ON profile
  BEGIN
    UPDATE profile
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
  END;

  -- Auto-update exercises timestamp on any update
  CREATE TRIGGER IF NOT EXISTS update_exercises_timestamp
  AFTER UPDATE ON exercises
  BEGIN
    UPDATE exercises
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = NEW.id;
  END;

  -- Auto-update recent_exercises when a set is added
  -- This keeps the "recent exercises" list fresh for quick access
  CREATE TRIGGER IF NOT EXISTS update_recent_exercises
  AFTER INSERT ON sets
  BEGIN
    INSERT OR REPLACE INTO recent_exercises (exercise_id, last_used, use_count, last_weight, last_reps)
    VALUES (
      NEW.exercise_id,
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      COALESCE((SELECT use_count FROM recent_exercises WHERE exercise_id = NEW.exercise_id), 0) + 1,
      NEW.weight,
      NEW.reps
    );
  END;

  -- Auto-update app_metadata timestamp
  CREATE TRIGGER IF NOT EXISTS update_metadata_timestamp
  AFTER UPDATE ON app_metadata
  BEGIN
    UPDATE app_metadata
    SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE key = NEW.key;
  END;
`;

// Initial data to seed the database
export const INITIAL_DATA = {
  // Default tags for exercise categorization
  tags: [
    { name: 'Chest', color: '#FF6B6B' },
    { name: 'Back', color: '#4ECDC4' },
    { name: 'Legs', color: '#45B7D1' },
    { name: 'Shoulders', color: '#96CEB4' },
    { name: 'Arms', color: '#FFEAA7' },
    { name: 'Core', color: '#DDA0DD' },
    { name: 'Cardio', color: '#98D8C8' },
    { name: 'Compound', color: '#6C5CE7' },
    { name: 'Isolation', color: '#A29BFE' },
    // Korean variation tags
    { name: '박재훈 버전', color: '#FD79A8' },
    { name: '변형 동작', color: '#FDCB6E' }
  ],

  // Sample exercises (optional - can be removed if user wants to start fresh)
  exercises: [
    { name: 'Squat', tags: ['Legs', 'Compound'] },
    { name: 'Deadlift', tags: ['Back', 'Legs', 'Compound'] },
    { name: 'Bench Press', tags: ['Chest', 'Compound'] },
    { name: 'Pull-ups', tags: ['Back', 'Compound'] },
    { name: 'Overhead Press', tags: ['Shoulders', 'Compound'] },
    { name: 'Barbell Row', tags: ['Back', 'Compound'] },
    { name: 'Dips', tags: ['Chest', 'Arms', 'Compound'] },
    { name: 'Lunges', tags: ['Legs', 'Compound'] }
  ]
};

/**
 * Migration scripts for future database versions
 * Add new migrations here as the schema evolves
 */
export const MIGRATIONS: { [version: number]: string } = {
  // Example migration for v2 (when needed)
  // 2: `
  //   ALTER TABLE exercises ADD COLUMN category TEXT;
  //   ALTER TABLE profile ADD COLUMN theme TEXT DEFAULT 'light';
  // `
};

/**
 * Validation helpers
 */
export const VALIDATION = {
  // Weight must be in 0.5kg increments
  isValidWeight: (weight: number): boolean => {
    return weight >= 0 && weight % 0.5 === 0;
  },

  // Reps must be non-negative
  isValidReps: (reps: number): boolean => {
    return reps >= 0 && Number.isInteger(reps);
  },

  // Date must be in YYYY-MM-DD format
  isValidDate: (date: string): boolean => {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
  }
};
