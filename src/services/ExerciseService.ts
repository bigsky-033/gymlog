/**
 * ExerciseService
 *
 * Service layer for exercise-related operations
 * Includes caching, pagination, and proper error handling
 */

import { DatabaseService } from '../database/DatabaseService';
import { Exercise, ExerciseDB, Tag, TagDB, Set, SetDB, SetFormData, fromDB, toDB } from '../types';
import { cache, CacheKeys, CacheInvalidation } from '../utils/cache';
import { NotFoundError, ValidationError, parseSQLiteError, logError } from '../utils/errors';
import { PaginationParams, PaginatedResult, validatePaginationParams, getPaginationSQL, buildPaginatedResult } from '../utils/pagination';

export interface ExerciseFilter {
  searchQuery?: string;
  tagIds?: number[];
  favoritesOnly?: boolean;
}

export class ExerciseService {
  private db: DatabaseService;

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  /**
   * Get all exercises with optional filtering
   * Uses caching for performance
   */
  async getAllExercises(filter?: ExerciseFilter): Promise<Exercise[]> {
    try {
      // Build cache key based on filter
      const cacheKey = filter
        ? `${CacheKeys.allExercises()}:${JSON.stringify(filter)}`
        : CacheKeys.allExercises();

      return await cache.getOrFetch(cacheKey, async () => {
        let sql = `
          SELECT
            e.id,
            e.name,
            e.notes,
            e.default_weight,
            e.default_reps,
            e.unit,
            e.is_favorite,
            e.created_at,
            e.updated_at,
            GROUP_CONCAT(t.id) as tag_ids,
            GROUP_CONCAT(t.name) as tag_names,
            GROUP_CONCAT(t.color) as tag_colors,
            GROUP_CONCAT(t.created_at) as tag_created_ats
          FROM exercises e
          LEFT JOIN exercise_tags et ON e.id = et.exercise_id
          LEFT JOIN tags t ON et.tag_id = t.id
          WHERE 1=1
        `;

        const params: any[] = [];

        if (filter?.searchQuery) {
          sql += ' AND e.name LIKE ?';
          params.push(`%${filter.searchQuery}%`);
        }

        if (filter?.favoritesOnly) {
          sql += ' AND e.is_favorite = 1';
        }

        if (filter?.tagIds && filter.tagIds.length > 0) {
          sql += ` AND e.id IN (
            SELECT exercise_id FROM exercise_tags
            WHERE tag_id IN (${filter.tagIds.map(() => '?').join(',')})
          )`;
          params.push(...filter.tagIds);
        }

        sql += ' GROUP BY e.id ORDER BY e.name COLLATE NOCASE ASC';

        const rows = await this.db.executeQuery<ExerciseDB & {
          tag_ids: string | null;
          tag_names: string | null;
          tag_colors: string | null;
          tag_created_ats: string | null;
        }>(sql, params);

        return rows.map(row => {
          const exercise = fromDB.exercise(row);

          // Parse tags from GROUP_CONCAT results
          if (row.tag_ids) {
            const ids = row.tag_ids.split(',');
            const names = row.tag_names!.split(',');
            const colors = row.tag_colors!.split(',');
            const createdAts = row.tag_created_ats!.split(',');

            exercise.tags = ids.map((id, index) => ({
              id: parseInt(id),
              name: names[index],
              color: colors[index],
              createdAt: new Date(createdAts[index])
            }));
          } else {
            exercise.tags = [];
          }

          return exercise;
        });
      });
    } catch (error) {
      logError(error, { method: 'getAllExercises', filter });
      throw parseSQLiteError(error, 'getAllExercises');
    }
  }

  /**
   * Get paginated exercises
   */
  async getPaginatedExercises(
    pagination: Partial<PaginationParams>,
    filter?: ExerciseFilter
  ): Promise<PaginatedResult<Exercise>> {
    try {
      const params = validatePaginationParams(pagination);

      // Get total count
      let countSql = 'SELECT COUNT(*) as count FROM exercises WHERE 1=1';
      const countParams: any[] = [];

      if (filter?.searchQuery) {
        countSql += ' AND name LIKE ?';
        countParams.push(`%${filter.searchQuery}%`);
      }

      if (filter?.favoritesOnly) {
        countSql += ' AND is_favorite = 1';
      }

      if (filter?.tagIds && filter.tagIds.length > 0) {
        countSql += ` AND id IN (
          SELECT exercise_id FROM exercise_tags
          WHERE tag_id IN (${filter.tagIds.map(() => '?').join(',')})
        )`;
        countParams.push(...filter.tagIds);
      }

      const countResult = await this.db.getFirst<{ count: number }>(countSql, countParams);
      const totalItems = countResult?.count || 0;

      // Get data (reuse getAllExercises with limit)
      const exercises = await this.getAllExercises(filter);
      const start = params.page * params.pageSize;
      const end = start + params.pageSize;
      const data = exercises.slice(start, end);

      return buildPaginatedResult(data, params, totalItems);
    } catch (error) {
      logError(error, { method: 'getPaginatedExercises', pagination, filter });
      throw parseSQLiteError(error, 'getPaginatedExercises');
    }
  }

  /**
   * Get exercise by ID
   */
  async getExerciseById(id: number): Promise<Exercise> {
    try {
      return await cache.getOrFetch(CacheKeys.exerciseById(id), async () => {
        const exercises = await this.getAllExercises();
        const exercise = exercises.find(e => e.id === id);

        if (!exercise) {
          throw new NotFoundError('Exercise', id);
        }

        return exercise;
      });
    } catch (error) {
      logError(error, { method: 'getExerciseById', id });
      if (error instanceof NotFoundError) throw error;
      throw parseSQLiteError(error, 'getExerciseById');
    }
  }

  /**
   * Get recent/frequently used exercises
   */
  async getRecentExercises(limit: number = 10): Promise<Exercise[]> {
    try {
      return await cache.getOrFetch(CacheKeys.recentExercises(), async () => {
        const sql = `
          SELECT
            e.*,
            re.last_used,
            re.use_count,
            re.last_weight,
            re.last_reps
          FROM recent_exercises re
          JOIN exercises e ON re.exercise_id = e.id
          ORDER BY re.last_used DESC
          LIMIT ?
        `;

        const rows = await this.db.executeQuery<ExerciseDB>(sql, [limit]);
        return rows.map(row => fromDB.exercise(row));
      });
    } catch (error) {
      logError(error, { method: 'getRecentExercises', limit });
      throw parseSQLiteError(error, 'getRecentExercises');
    }
  }

  /**
   * Create new exercise
   */
  async createExercise(data: {
    name: string;
    notes?: string;
    defaultWeight?: number;
    defaultReps?: number;
    unit?: 'kg' | 'lbs';
    tagIds?: number[];
  }): Promise<number> {
    try {
      // Validate
      if (!data.name || data.name.trim().length === 0) {
        throw new ValidationError('Exercise name is required', 'name');
      }

      if (data.defaultWeight !== undefined && data.defaultWeight < 0) {
        throw new ValidationError('Weight cannot be negative', 'defaultWeight', data.defaultWeight);
      }

      if (data.defaultReps !== undefined && data.defaultReps < 0) {
        throw new ValidationError('Reps cannot be negative', 'defaultReps', data.defaultReps);
      }

      const exerciseId = await this.db.transaction(async () => {
        // Insert exercise
        const result = await this.db.executeRun(
          `INSERT INTO exercises (name, notes, default_weight, default_reps, unit)
           VALUES (?, ?, ?, ?, ?)`,
          [
            data.name.trim(),
            data.notes || null,
            data.defaultWeight || null,
            data.defaultReps || null,
            data.unit || 'kg'
          ]
        );

        const exerciseId = result.lastInsertRowId!;

        // Add tags
        if (data.tagIds && data.tagIds.length > 0) {
          for (const tagId of data.tagIds) {
            await this.db.executeRun(
              'INSERT INTO exercise_tags (exercise_id, tag_id) VALUES (?, ?)',
              [exerciseId, tagId]
            );
          }
        }

        return exerciseId;
      });

      // Invalidate cache
      CacheInvalidation.onExerciseChange(exerciseId);

      return exerciseId;
    } catch (error) {
      logError(error, { method: 'createExercise', data });
      throw parseSQLiteError(error, 'createExercise');
    }
  }

  /**
   * Update exercise
   */
  async updateExercise(id: number, data: Partial<{
    name: string;
    notes: string;
    defaultWeight: number;
    defaultReps: number;
    unit: 'kg' | 'lbs';
    isFavorite: boolean;
    tagIds: number[];
  }>): Promise<void> {
    try {
      // Check exercise exists
      await this.getExerciseById(id);

      // Validate
      if (data.name !== undefined && data.name.trim().length === 0) {
        throw new ValidationError('Exercise name cannot be empty', 'name');
      }

      if (data.defaultWeight !== undefined && data.defaultWeight < 0) {
        throw new ValidationError('Weight cannot be negative', 'defaultWeight', data.defaultWeight);
      }

      if (data.defaultReps !== undefined && data.defaultReps < 0) {
        throw new ValidationError('Reps cannot be negative', 'defaultReps', data.defaultReps);
      }

      await this.db.transaction(async () => {
        // Update exercise fields
        const updates: string[] = [];
        const params: any[] = [];

        if (data.name !== undefined) {
          updates.push('name = ?');
          params.push(data.name.trim());
        }
        if (data.notes !== undefined) {
          updates.push('notes = ?');
          params.push(data.notes || null);
        }
        if (data.defaultWeight !== undefined) {
          updates.push('default_weight = ?');
          params.push(data.defaultWeight);
        }
        if (data.defaultReps !== undefined) {
          updates.push('default_reps = ?');
          params.push(data.defaultReps);
        }
        if (data.unit !== undefined) {
          updates.push('unit = ?');
          params.push(data.unit);
        }
        if (data.isFavorite !== undefined) {
          updates.push('is_favorite = ?');
          params.push(data.isFavorite ? 1 : 0);
        }

        if (updates.length > 0) {
          params.push(id);
          await this.db.executeRun(
            `UPDATE exercises SET ${updates.join(', ')} WHERE id = ?`,
            params
          );
        }

        // Update tags if provided
        if (data.tagIds !== undefined) {
          // Remove existing tags
          await this.db.executeRun(
            'DELETE FROM exercise_tags WHERE exercise_id = ?',
            [id]
          );

          // Add new tags
          for (const tagId of data.tagIds) {
            await this.db.executeRun(
              'INSERT INTO exercise_tags (exercise_id, tag_id) VALUES (?, ?)',
              [id, tagId]
            );
          }
        }
      });

      // Invalidate cache
      CacheInvalidation.onExerciseChange(id);
    } catch (error) {
      logError(error, { method: 'updateExercise', id, data });
      if (error instanceof NotFoundError || error instanceof ValidationError) throw error;
      throw parseSQLiteError(error, 'updateExercise');
    }
  }

  /**
   * Delete exercise
   */
  async deleteExercise(id: number): Promise<void> {
    try {
      // Check exercise exists
      await this.getExerciseById(id);

      await this.db.executeRun('DELETE FROM exercises WHERE id = ?', [id]);

      // Invalidate cache
      CacheInvalidation.onExerciseChange(id);
    } catch (error) {
      logError(error, { method: 'deleteExercise', id });
      if (error instanceof NotFoundError) throw error;
      throw parseSQLiteError(error, 'deleteExercise');
    }
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(id: number): Promise<void> {
    try {
      // Check exercise exists
      await this.getExerciseById(id);

      await this.db.executeRun(
        'UPDATE exercises SET is_favorite = NOT is_favorite WHERE id = ?',
        [id]
      );

      // Invalidate cache
      CacheInvalidation.onExerciseChange(id);
    } catch (error) {
      logError(error, { method: 'toggleFavorite', id });
      if (error instanceof NotFoundError) throw error;
      throw parseSQLiteError(error, 'toggleFavorite');
    }
  }

  /**
   * Add a set to workout session
   */
  async addSet(sessionId: number, data: SetFormData): Promise<number> {
    try {
      // Validate
      if (data.weight < 0) {
        throw new ValidationError('Weight cannot be negative', 'weight', data.weight);
      }
      if (data.reps < 0) {
        throw new ValidationError('Reps cannot be negative', 'reps', data.reps);
      }

      // Get the next set order
      const lastSet = await this.db.getFirst<{ max_order: number | null }>(
        'SELECT MAX(set_order) as max_order FROM sets WHERE session_id = ?',
        [sessionId]
      );

      const setOrder = (lastSet?.max_order || 0) + 1;

      const result = await this.db.executeRun(
        `INSERT INTO sets
         (session_id, exercise_id, weight, reps, is_warmup, is_failure, notes, set_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          data.exerciseId,
          data.weight,
          data.reps,
          data.isWarmup ? 1 : 0,
          data.isFailure ? 1 : 0,
          data.notes || null,
          setOrder
        ]
      );

      const setId = result.lastInsertRowId!;

      // Invalidate cache
      CacheInvalidation.onSetChange(sessionId, data.exerciseId);

      return setId;
    } catch (error) {
      logError(error, { method: 'addSet', sessionId, data });
      if (error instanceof ValidationError) throw error;
      throw parseSQLiteError(error, 'addSet');
    }
  }

  /**
   * Get sets for a session
   */
  async getSessionSets(sessionId: number): Promise<Set[]> {
    try {
      return await cache.getOrFetch(CacheKeys.setsBySession(sessionId), async () => {
        const sql = `
          SELECT
            s.*,
            e.name as exercise_name
          FROM sets s
          JOIN exercises e ON s.exercise_id = e.id
          WHERE s.session_id = ?
          ORDER BY s.set_order ASC
        `;

        const rows = await this.db.executeQuery<SetDB & { exercise_name: string }>(sql, [sessionId]);
        return rows.map(row => {
          const set = fromDB.set(row);
          set.exerciseName = row.exercise_name;
          return set;
        });
      });
    } catch (error) {
      logError(error, { method: 'getSessionSets', sessionId });
      throw parseSQLiteError(error, 'getSessionSets');
    }
  }

  /**
   * Get last sets for an exercise (for copying)
   */
  async getLastSetsForExercise(exerciseId: number, limit: number = 5): Promise<Set[]> {
    try {
      const sql = `
        SELECT * FROM sets
        WHERE exercise_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `;

      const rows = await this.db.executeQuery<SetDB>(sql, [exerciseId, limit]);
      return rows.map(row => fromDB.set(row));
    } catch (error) {
      logError(error, { method: 'getLastSetsForExercise', exerciseId, limit });
      throw parseSQLiteError(error, 'getLastSetsForExercise');
    }
  }

  /**
   * Update a set
   */
  async updateSet(id: number, data: Partial<SetFormData>): Promise<void> {
    try {
      // Validate
      if (data.weight !== undefined && data.weight < 0) {
        throw new ValidationError('Weight cannot be negative', 'weight', data.weight);
      }
      if (data.reps !== undefined && data.reps < 0) {
        throw new ValidationError('Reps cannot be negative', 'reps', data.reps);
      }

      // Get existing set to know sessionId and exerciseId for cache invalidation
      const existing = await this.db.getFirst<SetDB>(
        'SELECT * FROM sets WHERE id = ?',
        [id]
      );

      if (!existing) {
        throw new NotFoundError('Set', id);
      }

      const updates: string[] = [];
      const params: any[] = [];

      if (data.weight !== undefined) {
        updates.push('weight = ?');
        params.push(data.weight);
      }
      if (data.reps !== undefined) {
        updates.push('reps = ?');
        params.push(data.reps);
      }
      if (data.isWarmup !== undefined) {
        updates.push('is_warmup = ?');
        params.push(data.isWarmup ? 1 : 0);
      }
      if (data.isFailure !== undefined) {
        updates.push('is_failure = ?');
        params.push(data.isFailure ? 1 : 0);
      }
      if (data.notes !== undefined) {
        updates.push('notes = ?');
        params.push(data.notes || null);
      }

      if (updates.length > 0) {
        params.push(id);
        await this.db.executeRun(
          `UPDATE sets SET ${updates.join(', ')} WHERE id = ?`,
          params
        );

        // Invalidate cache
        CacheInvalidation.onSetChange(existing.session_id, existing.exercise_id);
      }
    } catch (error) {
      logError(error, { method: 'updateSet', id, data });
      if (error instanceof NotFoundError || error instanceof ValidationError) throw error;
      throw parseSQLiteError(error, 'updateSet');
    }
  }

  /**
   * Delete a set
   */
  async deleteSet(id: number): Promise<void> {
    try {
      // Get existing set to know sessionId and exerciseId for cache invalidation
      const existing = await this.db.getFirst<SetDB>(
        'SELECT * FROM sets WHERE id = ?',
        [id]
      );

      if (!existing) {
        throw new NotFoundError('Set', id);
      }

      await this.db.executeRun('DELETE FROM sets WHERE id = ?', [id]);

      // Invalidate cache
      CacheInvalidation.onSetChange(existing.session_id, existing.exercise_id);
    } catch (error) {
      logError(error, { method: 'deleteSet', id });
      if (error instanceof NotFoundError) throw error;
      throw parseSQLiteError(error, 'deleteSet');
    }
  }

  /**
   * Get all tags
   */
  async getAllTags(): Promise<Tag[]> {
    try {
      return await cache.getOrFetch(CacheKeys.allTags(), async () => {
        const rows = await this.db.executeQuery<TagDB>(
          'SELECT * FROM tags ORDER BY name COLLATE NOCASE ASC'
        );
        return rows.map(row => fromDB.tag(row));
      });
    } catch (error) {
      logError(error, { method: 'getAllTags' });
      throw parseSQLiteError(error, 'getAllTags');
    }
  }

  /**
   * Create new tag
   */
  async createTag(name: string, color: string = '#007AFF'): Promise<number> {
    try {
      if (!name || name.trim().length === 0) {
        throw new ValidationError('Tag name is required', 'name');
      }

      const result = await this.db.executeRun(
        'INSERT INTO tags (name, color) VALUES (?, ?)',
        [name.trim(), color]
      );

      const tagId = result.lastInsertRowId!;

      // Invalidate cache
      CacheInvalidation.onTagChange(tagId);

      return tagId;
    } catch (error) {
      logError(error, { method: 'createTag', name, color });
      throw parseSQLiteError(error, 'createTag');
    }
  }

  /**
   * Update tag
   */
  async updateTag(id: number, name?: string, color?: string): Promise<void> {
    try {
      const updates: string[] = [];
      const params: any[] = [];

      if (name !== undefined) {
        if (name.trim().length === 0) {
          throw new ValidationError('Tag name cannot be empty', 'name');
        }
        updates.push('name = ?');
        params.push(name.trim());
      }

      if (color !== undefined) {
        updates.push('color = ?');
        params.push(color);
      }

      if (updates.length > 0) {
        params.push(id);
        await this.db.executeRun(
          `UPDATE tags SET ${updates.join(', ')} WHERE id = ?`,
          params
        );

        // Invalidate cache
        CacheInvalidation.onTagChange(id);
      }
    } catch (error) {
      logError(error, { method: 'updateTag', id, name, color });
      if (error instanceof ValidationError) throw error;
      throw parseSQLiteError(error, 'updateTag');
    }
  }

  /**
   * Delete tag
   */
  async deleteTag(id: number): Promise<void> {
    try {
      await this.db.executeRun('DELETE FROM tags WHERE id = ?', [id]);

      // Invalidate cache
      CacheInvalidation.onTagChange(id);
    } catch (error) {
      logError(error, { method: 'deleteTag', id });
      throw parseSQLiteError(error, 'deleteTag');
    }
  }
}
