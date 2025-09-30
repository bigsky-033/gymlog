// Database Types - Match exactly with SQLite schema
export interface Profile {
  id: number;
  name: string;
  weightUnit: 'kg' | 'lbs';
  weekStartsOn: 'monday' | 'sunday';
  createdAt: Date;
  updatedAt: Date;
}

export interface Exercise {
  id: number;
  name: string;
  notes?: string;
  defaultWeight?: number;
  defaultReps?: number;
  unit: 'kg' | 'lbs';
  isFavorite: boolean;
  tags?: Tag[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Tag {
  id: number;
  name: string;
  color?: string;
}

export interface WorkoutSession {
  id: number;
  date: Date;
  timeOfDay?: 'morning' | 'afternoon' | 'evening';
  notes?: string;
  duration?: number; // in minutes
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
  lastWeight: number;
  lastReps: number;
}

// Form Types
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
  unit: 'kg' | 'lbs';
  tagIds: number[];
}

// Analytics Types
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
  };
  sessions: number;
  lastPerformed: Date;
}

export interface ProgressPoint {
  date: Date;
  value: number;
  label?: string;
}

// Navigation Types
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

// Filter/Sort Types
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
