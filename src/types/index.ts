// ============================================
// REUSABLE TYPE ALIASES
// ============================================
export type WeightUnit = 'kg' | 'lbs';
export type WeekStart = 'monday' | 'sunday';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';
export type SupportedLocale = 'en' | 'ko';  // English, Korean
export type DateString = string; // ISO 8601 format: 'YYYY-MM-DD'
export type TimestampString = string; // ISO 8601 format with time

// ============================================
// DATABASE LAYER TYPES (as stored in SQLite)
// ============================================
// IMPORTANT: SQLite stores dates as ISO strings, booleans as 0/1
// These types match EXACTLY what comes from the database

export interface ProfileDB {
  id: number;
  name: string;
  weight_unit: WeightUnit;
  week_starts_on: WeekStart;
  locale: SupportedLocale;
  timezone: string;  // IANA timezone (e.g., 'Asia/Seoul', 'America/New_York')
  default_rest_timer: number;
  auto_backup_enabled: number;  // 0 or 1
  created_at: TimestampString;
  updated_at: TimestampString;
}

export interface ExerciseDB {
  id: number;
  name: string;
  notes: string | null;
  default_weight: number | null;
  default_reps: number | null;
  unit: WeightUnit;
  is_favorite: number;  // 0 or 1
  created_at: TimestampString;
  updated_at: TimestampString;
}

export interface TagDB {
  id: number;
  name: string;
  color: string;
  created_at: TimestampString;
}

export interface WorkoutSessionDB {
  id: number;
  date: DateString;  // 'YYYY-MM-DD'
  time_of_day: TimeOfDay | null;
  duration_minutes: number | null;
  notes: string | null;
  created_at: TimestampString;
}

export interface SetDB {
  id: number;
  session_id: number;
  exercise_id: number;
  weight: number;
  reps: number;
  is_warmup: number;  // 0 or 1
  is_failure: number;  // 0 or 1
  rest_duration_seconds: number | null;
  notes: string | null;
  set_order: number;
  created_at: TimestampString;
}

export interface RecentExerciseDB {
  exercise_id: number;
  last_used: TimestampString;
  use_count: number;
  last_weight: number | null;
  last_reps: number | null;
}

// ============================================
// APPLICATION LAYER TYPES (used in React components)
// ============================================
// These types use JavaScript-friendly types (Date, boolean, optional)

export interface Profile {
  id: number;
  name: string;
  weightUnit: WeightUnit;
  weekStartsOn: WeekStart;
  locale: SupportedLocale;
  timezone: string;
  defaultRestTimer: number;
  autoBackupEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Exercise {
  id: number;
  name: string;
  notes?: string;
  defaultWeight?: number;
  defaultReps?: number;
  unit: WeightUnit;
  isFavorite: boolean;
  tags?: Tag[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  createdAt: Date;
}

export interface WorkoutSession {
  id: number;
  date: Date;
  timeOfDay?: TimeOfDay;
  durationMinutes?: number;
  notes?: string;
  sets?: Set[];
  createdAt: Date;
}

export interface Set {
  id: number;
  sessionId: number;
  exerciseId: number;
  exerciseName?: string; // Denormalized for display
  weight: number;
  reps: number;
  isWarmup: boolean;
  isFailure: boolean;
  restDuration?: number; // in seconds
  notes?: string;
  setOrder: number;
  createdAt: Date;
}

export interface RecentExercise {
  exerciseId: number;
  exerciseName: string;
  lastUsed: Date;
  useCount: number;
  lastWeight?: number;
  lastReps?: number;
}

// ============================================
// TYPE CONVERSION UTILITIES
// ============================================
export const fromDB = {
  profile: (db: ProfileDB): Profile => ({
    id: db.id,
    name: db.name,
    weightUnit: db.weight_unit,
    weekStartsOn: db.week_starts_on,
    locale: db.locale,
    timezone: db.timezone,
    defaultRestTimer: db.default_rest_timer,
    autoBackupEnabled: db.auto_backup_enabled === 1,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at)
  }),

  exercise: (db: ExerciseDB): Exercise => ({
    id: db.id,
    name: db.name,
    notes: db.notes ?? undefined,
    defaultWeight: db.default_weight ?? undefined,
    defaultReps: db.default_reps ?? undefined,
    unit: db.unit,
    isFavorite: db.is_favorite === 1,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at)
  }),

  tag: (db: TagDB): Tag => ({
    id: db.id,
    name: db.name,
    color: db.color,
    createdAt: new Date(db.created_at)
  }),

  session: (db: WorkoutSessionDB): WorkoutSession => ({
    id: db.id,
    date: new Date(db.date + 'T00:00:00'),
    timeOfDay: db.time_of_day ?? undefined,
    durationMinutes: db.duration_minutes ?? undefined,
    notes: db.notes ?? undefined,
    createdAt: new Date(db.created_at)
  }),

  set: (db: SetDB): Set => ({
    id: db.id,
    sessionId: db.session_id,
    exerciseId: db.exercise_id,
    weight: db.weight,
    reps: db.reps,
    isWarmup: db.is_warmup === 1,
    isFailure: db.is_failure === 1,
    restDuration: db.rest_duration_seconds ?? undefined,
    notes: db.notes ?? undefined,
    setOrder: db.set_order,
    createdAt: new Date(db.created_at)
  })
};

export const toDB = {
  profile: (profile: Partial<Profile>): Partial<ProfileDB> => ({
    name: profile.name,
    weight_unit: profile.weightUnit,
    week_starts_on: profile.weekStartsOn,
    locale: profile.locale,
    timezone: profile.timezone,
    default_rest_timer: profile.defaultRestTimer,
    auto_backup_enabled: profile.autoBackupEnabled ? 1 : 0
  }),

  exercise: (ex: Partial<Exercise>): Partial<ExerciseDB> => ({
    name: ex.name,
    notes: ex.notes ?? null,
    default_weight: ex.defaultWeight ?? null,
    default_reps: ex.defaultReps ?? null,
    unit: ex.unit,
    is_favorite: ex.isFavorite ? 1 : 0
  }),

  set: (set: Partial<Set>): Partial<SetDB> => ({
    session_id: set.sessionId,
    exercise_id: set.exerciseId,
    weight: set.weight,
    reps: set.reps,
    is_warmup: set.isWarmup ? 1 : 0,
    is_failure: set.isFailure ? 1 : 0,
    rest_duration_seconds: set.restDuration ?? null,
    notes: set.notes ?? null,
    set_order: set.setOrder
  })
};

// ============================================
// FORM TYPES
// ============================================
export interface SetFormData {
  exerciseId: number;
  weight: number;
  reps: number;
  isWarmup: boolean;
  isFailure: boolean;
  notes?: string;
}

export interface ExerciseFormData {
  name: string;
  notes?: string;
  defaultWeight?: number;
  defaultReps?: number;
  unit: WeightUnit;
  tagIds: number[];
}

// ============================================
// ANALYTICS TYPES
// ============================================
export interface ExerciseStats {
  exerciseId: number;
  exerciseName: string;
  totalSets: number;
  totalReps: number;
  totalVolume: number;
  averageWeight: number;
  maxWeight: number;
  maxReps: number;
  personalRecord: {
    weight: number;
    reps: number;
    date: Date;
  } | null;
  sessions: number;
  lastPerformed: Date | null;
}

export interface ProgressPoint {
  date: Date;
  value: number;
  label?: string;
}

// ============================================
// NAVIGATION TYPES
// ============================================
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

export type RootStackParamList = {
  Calendar: undefined;
  Exercises: undefined;
  Analytics: undefined;
  Settings: undefined;
  DayView: { date: string };
  ExerciseDetail: { exerciseId: number };
  SetEntry: {
    sessionId: number;
    exerciseId?: number;
    copyFromSet?: Set;
  };
};

export type NavigationProp<T extends keyof RootStackParamList> =
  NativeStackNavigationProp<RootStackParamList, T>;

export type ScreenRouteProp<T extends keyof RootStackParamList> =
  RouteProp<RootStackParamList, T>;

// ============================================
// FILTER/SORT TYPES
// ============================================
export interface ExerciseFilter {
  tagIds?: number[];
  searchQuery?: string;
  favoritesOnly?: boolean;
}

export interface DateRange {
  start: Date;
  end: Date;
  preset?: '1w' | '2w' | '1m' | '3m' | '6m' | '1y' | 'custom';
}

// ============================================
// UTILITY TYPES
// ============================================
export type CreateExercise = Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'tags'>;
export type UpdateExercise = Partial<CreateExercise> & { id: number };
export type CreateWorkoutSession = Omit<WorkoutSession, 'id' | 'createdAt' | 'sets'>;
export type UpdateWorkoutSession = Partial<CreateWorkoutSession> & { id: number };

// ============================================
// VALIDATION CONSTANTS
// ============================================
export const WEIGHT_LIMITS = {
  MIN: 0,
  MAX: 1000,
  INCREMENT: 0.5
} as const;

export const REPS_LIMITS = {
  MIN: 0,
  MAX: 999
} as const;

export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'ko'];
export const SUPPORTED_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Sydney'
] as const;
