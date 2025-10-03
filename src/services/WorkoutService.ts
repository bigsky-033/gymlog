/**
 * WorkoutService
 *
 * Service layer for workout session-related operations
 * Handles session management, calendar data, and workout statistics
 */

import { DatabaseService } from '../database/DatabaseService';
import { WorkoutSession, WorkoutSessionDB, TimeOfDay, fromDB } from '../types';
import { cache, CacheKeys, CacheInvalidation } from '../utils/cache';
import { NotFoundError, ValidationError, parseSQLiteError, logError } from '../utils/errors';
import { PaginationParams, PaginatedResult, validatePaginationParams, getPaginationSQL, buildPaginatedResult } from '../utils/pagination';

export interface SessionWithStats extends WorkoutSession {
  setCount: number;
  exerciseNames: string[];
  totalVolume: number; // weight * reps
}

export class WorkoutService {
  private db: DatabaseService;

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  /**
   * Get or create session for a specific date
   * Returns session ID
   */
  async getOrCreateSession(date: string, timeOfDay?: TimeOfDay): Promise<number> {
    try {
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new ValidationError('Invalid date format. Use YYYY-MM-DD', 'date', date);
      }

      // Check if session exists
      const existing = await this.db.getFirst<{ id: number }>(
        timeOfDay
          ? 'SELECT id FROM workout_sessions WHERE date = ? AND time_of_day = ?'
          : 'SELECT id FROM workout_sessions WHERE date = ? AND time_of_day IS NULL',
        timeOfDay ? [date, timeOfDay] : [date]
      );

      if (existing) {
        return existing.id;
      }

      // Create new session
      const result = await this.db.executeRun(
        'INSERT INTO workout_sessions (date, time_of_day) VALUES (?, ?)',
        [date, timeOfDay || null]
      );

      const sessionId = result.lastInsertRowId!;

      // Invalidate cache
      CacheInvalidation.onSessionChange(sessionId, date);

      return sessionId;
    } catch (error) {
      logError(error, { method: 'getOrCreateSession', date, timeOfDay });
      if (error instanceof ValidationError) throw error;
      throw parseSQLiteError(error, 'getOrCreateSession');
    }
  }

  /**
   * Get session by ID
   */
  async getSessionById(id: number): Promise<WorkoutSession> {
    try {
      return await cache.getOrFetch(CacheKeys.sessionById(id), async () => {
        const row = await this.db.getFirst<WorkoutSessionDB>(
          'SELECT * FROM workout_sessions WHERE id = ?',
          [id]
        );

        if (!row) {
          throw new NotFoundError('Workout session', id);
        }

        return fromDB.session(row);
      });
    } catch (error) {
      logError(error, { method: 'getSessionById', id });
      if (error instanceof NotFoundError) throw error;
      throw parseSQLiteError(error, 'getSessionById');
    }
  }

  /**
   * Get session with statistics
   */
  async getSessionWithStats(id: number): Promise<SessionWithStats> {
    try {
      const sql = `
        SELECT
          ws.*,
          COUNT(s.id) as set_count,
          GROUP_CONCAT(DISTINCT e.name) as exercises,
          SUM(s.weight * s.reps) as total_volume
        FROM workout_sessions ws
        LEFT JOIN sets s ON ws.id = s.session_id
        LEFT JOIN exercises e ON s.exercise_id = e.id
        WHERE ws.id = ?
        GROUP BY ws.id
      `;

      const row = await this.db.getFirst<WorkoutSessionDB & {
        set_count: number;
        exercises: string | null;
        total_volume: number | null;
      }>(sql, [id]);

      if (!row) {
        throw new NotFoundError('Workout session', id);
      }

      const session = fromDB.session(row) as SessionWithStats;
      session.setCount = row.set_count;
      session.exerciseNames = row.exercises ? row.exercises.split(',') : [];
      session.totalVolume = row.total_volume || 0;

      return session;
    } catch (error) {
      logError(error, { method: 'getSessionWithStats', id });
      if (error instanceof NotFoundError) throw error;
      throw parseSQLiteError(error, 'getSessionWithStats');
    }
  }

  /**
   * Get sessions for a specific date
   */
  async getSessionsByDate(date: string): Promise<WorkoutSession[]> {
    try {
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new ValidationError('Invalid date format. Use YYYY-MM-DD', 'date', date);
      }

      return await cache.getOrFetch(CacheKeys.sessionsByDate(date), async () => {
        const rows = await this.db.executeQuery<WorkoutSessionDB>(
          'SELECT * FROM workout_sessions WHERE date = ? ORDER BY time_of_day',
          [date]
        );

        return rows.map(row => fromDB.session(row));
      });
    } catch (error) {
      logError(error, { method: 'getSessionsByDate', date });
      if (error instanceof ValidationError) throw error;
      throw parseSQLiteError(error, 'getSessionsByDate');
    }
  }

  /**
   * Get sessions for date range with statistics
   */
  async getSessionsForDateRange(
    startDate: string,
    endDate: string
  ): Promise<SessionWithStats[]> {
    try {
      // Validate date formats
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new ValidationError('Invalid date format. Use YYYY-MM-DD', 'date');
      }

      const cacheKey = CacheKeys.sessionsByDateRange(startDate, endDate);

      return await cache.getOrFetch(cacheKey, async () => {
        const sql = `
          SELECT
            ws.*,
            COUNT(s.id) as set_count,
            GROUP_CONCAT(DISTINCT e.name) as exercises,
            SUM(s.weight * s.reps) as total_volume
          FROM workout_sessions ws
          LEFT JOIN sets s ON ws.id = s.session_id
          LEFT JOIN exercises e ON s.exercise_id = e.id
          WHERE ws.date BETWEEN ? AND ?
          GROUP BY ws.id
          ORDER BY ws.date DESC, ws.time_of_day
        `;

        const rows = await this.db.executeQuery<WorkoutSessionDB & {
          set_count: number;
          exercises: string | null;
          total_volume: number | null;
        }>(sql, [startDate, endDate]);

        return rows.map(row => {
          const session = fromDB.session(row) as SessionWithStats;
          session.setCount = row.set_count;
          session.exerciseNames = row.exercises ? row.exercises.split(',') : [];
          session.totalVolume = row.total_volume || 0;
          return session;
        });
      });
    } catch (error) {
      logError(error, { method: 'getSessionsForDateRange', startDate, endDate });
      if (error instanceof ValidationError) throw error;
      throw parseSQLiteError(error, 'getSessionsForDateRange');
    }
  }

  /**
   * Get paginated sessions
   */
  async getPaginatedSessions(
    pagination: Partial<PaginationParams>
  ): Promise<PaginatedResult<SessionWithStats>> {
    try {
      const params = validatePaginationParams(pagination);

      // Get total count
      const countResult = await this.db.getFirst<{ count: number }>(
        'SELECT COUNT(*) as count FROM workout_sessions'
      );
      const totalItems = countResult?.count || 0;

      // Get data with pagination
      const { sql: paginationSql, params: paginationParams } = getPaginationSQL(params);

      const query = `
        SELECT
          ws.*,
          COUNT(s.id) as set_count,
          GROUP_CONCAT(DISTINCT e.name) as exercises,
          SUM(s.weight * s.reps) as total_volume
        FROM workout_sessions ws
        LEFT JOIN sets s ON ws.id = s.session_id
        LEFT JOIN exercises e ON s.exercise_id = e.id
        GROUP BY ws.id
        ORDER BY ws.date DESC, ws.time_of_day
        ${paginationSql}
      `;

      const rows = await this.db.executeQuery<WorkoutSessionDB & {
        set_count: number;
        exercises: string | null;
        total_volume: number | null;
      }>(query, paginationParams);

      const data = rows.map(row => {
        const session = fromDB.session(row) as SessionWithStats;
        session.setCount = row.set_count;
        session.exerciseNames = row.exercises ? row.exercises.split(',') : [];
        session.totalVolume = row.total_volume || 0;
        return session;
      });

      return buildPaginatedResult(data, params, totalItems);
    } catch (error) {
      logError(error, { method: 'getPaginatedSessions', pagination });
      throw parseSQLiteError(error, 'getPaginatedSessions');
    }
  }

  /**
   * Get calendar markers (dates with workouts) for a specific month
   */
  async getCalendarMarkers(year: number, month: number): Promise<string[]> {
    try {
      // Validate inputs
      if (year < 1900 || year > 2100) {
        throw new ValidationError('Invalid year', 'year', year);
      }
      if (month < 1 || month > 12) {
        throw new ValidationError('Invalid month. Must be 1-12', 'month', month);
      }

      return await cache.getOrFetch(CacheKeys.calendarMarkers(year, month), async () => {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

        const sql = `
          SELECT DISTINCT date FROM workout_sessions
          WHERE date BETWEEN ? AND ?
          ORDER BY date
        `;

        const rows = await this.db.executeQuery<{ date: string }>(sql, [startDate, endDate]);
        return rows.map(r => r.date);
      });
    } catch (error) {
      logError(error, { method: 'getCalendarMarkers', year, month });
      if (error instanceof ValidationError) throw error;
      throw parseSQLiteError(error, 'getCalendarMarkers');
    }
  }

  /**
   * Update session details
   */
  async updateSession(id: number, data: Partial<{
    date: string;
    timeOfDay: TimeOfDay | null;
    durationMinutes: number;
    notes: string;
  }>): Promise<void> {
    try {
      // Check session exists
      const existing = await this.getSessionById(id);

      // Validate
      if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
        throw new ValidationError('Invalid date format. Use YYYY-MM-DD', 'date', data.date);
      }

      if (data.durationMinutes !== undefined && data.durationMinutes < 0) {
        throw new ValidationError('Duration cannot be negative', 'durationMinutes', data.durationMinutes);
      }

      const updates: string[] = [];
      const params: any[] = [];

      if (data.date !== undefined) {
        updates.push('date = ?');
        params.push(data.date);
      }
      if (data.timeOfDay !== undefined) {
        updates.push('time_of_day = ?');
        params.push(data.timeOfDay);
      }
      if (data.durationMinutes !== undefined) {
        updates.push('duration_minutes = ?');
        params.push(data.durationMinutes);
      }
      if (data.notes !== undefined) {
        updates.push('notes = ?');
        params.push(data.notes || null);
      }

      if (updates.length > 0) {
        params.push(id);
        await this.db.executeRun(
          `UPDATE workout_sessions SET ${updates.join(', ')} WHERE id = ?`,
          params
        );

        // Invalidate cache
        CacheInvalidation.onSessionChange(id, existing.date.toISOString().split('T')[0]);
        if (data.date) {
          CacheInvalidation.onSessionChange(id, data.date);
        }
      }
    } catch (error) {
      logError(error, { method: 'updateSession', id, data });
      if (error instanceof NotFoundError || error instanceof ValidationError) throw error;
      throw parseSQLiteError(error, 'updateSession');
    }
  }

  /**
   * Update session duration
   */
  async updateSessionDuration(sessionId: number, durationMinutes: number): Promise<void> {
    try {
      if (durationMinutes < 0) {
        throw new ValidationError('Duration cannot be negative', 'durationMinutes', durationMinutes);
      }

      await this.db.executeRun(
        'UPDATE workout_sessions SET duration_minutes = ? WHERE id = ?',
        [durationMinutes, sessionId]
      );

      // Invalidate cache
      CacheInvalidation.onSessionChange(sessionId);
    } catch (error) {
      logError(error, { method: 'updateSessionDuration', sessionId, durationMinutes });
      if (error instanceof ValidationError) throw error;
      throw parseSQLiteError(error, 'updateSessionDuration');
    }
  }

  /**
   * Delete session and all its sets (CASCADE)
   */
  async deleteSession(sessionId: number): Promise<void> {
    try {
      // Get session for cache invalidation
      const session = await this.getSessionById(sessionId);

      // Sets will be deleted automatically due to CASCADE
      await this.db.executeRun(
        'DELETE FROM workout_sessions WHERE id = ?',
        [sessionId]
      );

      // Invalidate cache
      CacheInvalidation.onSessionChange(sessionId, session.date.toISOString().split('T')[0]);
    } catch (error) {
      logError(error, { method: 'deleteSession', sessionId });
      if (error instanceof NotFoundError) throw error;
      throw parseSQLiteError(error, 'deleteSession');
    }
  }

  /**
   * Get workout statistics for date range
   */
  async getWorkoutStats(startDate: string, endDate: string): Promise<{
    totalSessions: number;
    totalSets: number;
    totalVolume: number;
    totalDuration: number;
    averageSessionDuration: number;
    workoutDays: number;
  }> {
    try {
      // Validate date formats
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new ValidationError('Invalid date format. Use YYYY-MM-DD', 'date');
      }

      const sql = `
        SELECT
          COUNT(DISTINCT ws.id) as total_sessions,
          COUNT(s.id) as total_sets,
          SUM(s.weight * s.reps) as total_volume,
          SUM(ws.duration_minutes) as total_duration,
          AVG(ws.duration_minutes) as avg_duration,
          COUNT(DISTINCT ws.date) as workout_days
        FROM workout_sessions ws
        LEFT JOIN sets s ON ws.id = s.session_id
        WHERE ws.date BETWEEN ? AND ?
      `;

      const result = await this.db.getFirst<{
        total_sessions: number;
        total_sets: number;
        total_volume: number | null;
        total_duration: number | null;
        avg_duration: number | null;
        workout_days: number;
      }>(sql, [startDate, endDate]);

      return {
        totalSessions: result?.total_sessions || 0,
        totalSets: result?.total_sets || 0,
        totalVolume: result?.total_volume || 0,
        totalDuration: result?.total_duration || 0,
        averageSessionDuration: result?.avg_duration || 0,
        workoutDays: result?.workout_days || 0
      };
    } catch (error) {
      logError(error, { method: 'getWorkoutStats', startDate, endDate });
      if (error instanceof ValidationError) throw error;
      throw parseSQLiteError(error, 'getWorkoutStats');
    }
  }

  /**
   * Get workout frequency (workouts per day of week)
   */
  async getWorkoutFrequency(startDate: string, endDate: string): Promise<{
    dayOfWeek: number; // 0 = Sunday, 6 = Saturday
    count: number;
  }[]> {
    try {
      // Validate date formats
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new ValidationError('Invalid date format. Use YYYY-MM-DD', 'date');
      }

      // SQLite's strftime('%w', date) returns 0-6 (Sunday = 0)
      const sql = `
        SELECT
          CAST(strftime('%w', date) AS INTEGER) as day_of_week,
          COUNT(*) as count
        FROM workout_sessions
        WHERE date BETWEEN ? AND ?
        GROUP BY day_of_week
        ORDER BY day_of_week
      `;

      return await this.db.executeQuery<{ day_of_week: number; count: number }>(
        sql,
        [startDate, endDate]
      );
    } catch (error) {
      logError(error, { method: 'getWorkoutFrequency', startDate, endDate });
      if (error instanceof ValidationError) throw error;
      throw parseSQLiteError(error, 'getWorkoutFrequency');
    }
  }

  /**
   * Check if workout exists on a specific date
   */
  async hasWorkoutOnDate(date: string): Promise<boolean> {
    try {
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new ValidationError('Invalid date format. Use YYYY-MM-DD', 'date', date);
      }

      const result = await this.db.getFirst<{ count: number }>(
        'SELECT COUNT(*) as count FROM workout_sessions WHERE date = ?',
        [date]
      );

      return (result?.count || 0) > 0;
    } catch (error) {
      logError(error, { method: 'hasWorkoutOnDate', date });
      if (error instanceof ValidationError) throw error;
      throw parseSQLiteError(error, 'hasWorkoutOnDate');
    }
  }
}
