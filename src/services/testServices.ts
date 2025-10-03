/**
 * Service Layer Tests
 *
 * Comprehensive tests for ExerciseService, WorkoutService, and BackupService
 * Run this to verify all service functionality
 */

import { ExerciseService } from './ExerciseService';
import { WorkoutService } from './WorkoutService';
import { BackupService } from './BackupService';
import { DatabaseService } from '../database/DatabaseService';

let testResults: { name: string; status: 'pass' | 'fail'; error?: string }[] = [];

/**
 * Test helper to run a test and catch errors
 */
async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  try {
    await testFn();
    testResults.push({ name, status: 'pass' });
    console.log(`✅ ${name}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    testResults.push({ name, status: 'fail', error: errorMsg });
    console.error(`❌ ${name}:`, errorMsg);
  }
}

/**
 * Main test function
 */
export async function testServices(): Promise<void> {
  console.log('\n🧪 ========== SERVICE LAYER TESTS START ==========\n');
  testResults = [];

  // Initialize database
  const db = DatabaseService.getInstance();
  await db.initDatabase();

  const exerciseService = new ExerciseService();
  const workoutService = new WorkoutService();
  const backupService = new BackupService();

  // Store IDs for cross-test usage
  let testExerciseId: number;
  let testTagId: number;
  let testSessionId: number;
  let testSetId: number;

  // ==================== TAG TESTS ====================
  console.log('📝 Testing Tag Operations...\n');

  await runTest('Create tag', async () => {
    testTagId = await exerciseService.createTag('Test Tag', '#FF0000');
    if (!testTagId) throw new Error('Tag ID not returned');
  });

  await runTest('Get all tags', async () => {
    const tags = await exerciseService.getAllTags();
    if (tags.length === 0) throw new Error('No tags found');
    const testTag = tags.find(t => t.id === testTagId);
    if (!testTag) throw new Error('Test tag not found');
    if (testTag.name !== 'Test Tag') throw new Error('Tag name mismatch');
    if (testTag.color !== '#FF0000') throw new Error('Tag color mismatch');
  });

  await runTest('Update tag', async () => {
    await exerciseService.updateTag(testTagId, 'Updated Tag', '#00FF00');
    const tags = await exerciseService.getAllTags();
    const updated = tags.find(t => t.id === testTagId);
    if (!updated) throw new Error('Updated tag not found');
    if (updated.name !== 'Updated Tag') throw new Error('Tag name not updated');
    if (updated.color !== '#00FF00') throw new Error('Tag color not updated');
  });

  // ==================== EXERCISE TESTS ====================
  console.log('\n📝 Testing Exercise Operations...\n');

  await runTest('Create exercise', async () => {
    testExerciseId = await exerciseService.createExercise({
      name: 'Test Exercise',
      notes: 'Test notes',
      defaultWeight: 50,
      defaultReps: 10,
      unit: 'kg',
      tagIds: [testTagId]
    });
    if (!testExerciseId) throw new Error('Exercise ID not returned');
  });

  await runTest('Get exercise by ID', async () => {
    const exercise = await exerciseService.getExerciseById(testExerciseId);
    if (exercise.name !== 'Test Exercise') throw new Error('Exercise name mismatch');
    if (exercise.defaultWeight !== 50) throw new Error('Default weight mismatch');
    if (exercise.defaultReps !== 10) throw new Error('Default reps mismatch');
    if (!exercise.tags || exercise.tags.length === 0) throw new Error('No tags found');
  });

  await runTest('Get all exercises', async () => {
    const exercises = await exerciseService.getAllExercises();
    const testEx = exercises.find(e => e.id === testExerciseId);
    if (!testEx) throw new Error('Test exercise not found in all exercises');
  });

  await runTest('Filter exercises by search', async () => {
    const exercises = await exerciseService.getAllExercises({ searchQuery: 'Test Exercise' });
    if (exercises.length === 0) throw new Error('No exercises found with search');
    const found = exercises.find(e => e.id === testExerciseId);
    if (!found) throw new Error('Test exercise not found in search results');
  });

  await runTest('Filter exercises by tag', async () => {
    const exercises = await exerciseService.getAllExercises({ tagIds: [testTagId] });
    const found = exercises.find(e => e.id === testExerciseId);
    if (!found) throw new Error('Test exercise not found in tag filter');
  });

  await runTest('Update exercise', async () => {
    await exerciseService.updateExercise(testExerciseId, {
      name: 'Updated Exercise',
      defaultWeight: 60
    });
    const exercise = await exerciseService.getExerciseById(testExerciseId);
    if (exercise.name !== 'Updated Exercise') throw new Error('Exercise name not updated');
    if (exercise.defaultWeight !== 60) throw new Error('Default weight not updated');
  });

  await runTest('Toggle favorite', async () => {
    await exerciseService.toggleFavorite(testExerciseId);
    const exercise = await exerciseService.getExerciseById(testExerciseId);
    if (!exercise.isFavorite) throw new Error('Exercise not marked as favorite');
  });

  await runTest('Get paginated exercises', async () => {
    const result = await exerciseService.getPaginatedExercises({ page: 0, pageSize: 10 });
    if (!result.data) throw new Error('No data in paginated result');
    if (result.totalItems === 0) throw new Error('Total items is 0');
    if (result.page !== 0) throw new Error('Page number mismatch');
  });

  // ==================== WORKOUT SESSION TESTS ====================
  console.log('\n📝 Testing Workout Session Operations...\n');

  await runTest('Create workout session', async () => {
    const today = new Date().toISOString().split('T')[0];
    testSessionId = await workoutService.getOrCreateSession(today, 'afternoon');
    if (!testSessionId) throw new Error('Session ID not returned');
  });

  await runTest('Get session by ID', async () => {
    const session = await workoutService.getSessionById(testSessionId);
    if (!session) throw new Error('Session not found');
    if (session.timeOfDay !== 'afternoon') throw new Error('Time of day mismatch');
  });

  await runTest('Get session with stats', async () => {
    const session = await workoutService.getSessionWithStats(testSessionId);
    if (!session) throw new Error('Session not found');
    if (session.setCount === undefined) throw new Error('Set count missing');
  });

  await runTest('Get sessions by date', async () => {
    const today = new Date().toISOString().split('T')[0];
    const sessions = await workoutService.getSessionsByDate(today);
    const found = sessions.find(s => s.id === testSessionId);
    if (!found) throw new Error('Test session not found by date');
  });

  await runTest('Update session', async () => {
    await workoutService.updateSession(testSessionId, {
      notes: 'Test session notes',
      durationMinutes: 45
    });
    const session = await workoutService.getSessionById(testSessionId);
    if (session.notes !== 'Test session notes') throw new Error('Notes not updated');
    if (session.durationMinutes !== 45) throw new Error('Duration not updated');
  });

  await runTest('Get calendar markers', async () => {
    const today = new Date();
    const markers = await workoutService.getCalendarMarkers(today.getFullYear(), today.getMonth() + 1);
    if (!Array.isArray(markers)) throw new Error('Markers is not an array');
  });

  await runTest('Get workout stats', async () => {
    const today = new Date().toISOString().split('T')[0];
    const stats = await workoutService.getWorkoutStats(today, today);
    if (stats.totalSessions === undefined) throw new Error('Total sessions missing');
    if (stats.totalSessions === 0) throw new Error('No sessions found in stats');
  });

  // ==================== SET TESTS ====================
  console.log('\n📝 Testing Set Operations...\n');

  await runTest('Add set to session', async () => {
    testSetId = await exerciseService.addSet(testSessionId, {
      exerciseId: testExerciseId,
      weight: 60,
      reps: 5,
      isWarmup: false,
      isFailure: false,
      notes: 'Test set'
    });
    if (!testSetId) throw new Error('Set ID not returned');
  });

  await runTest('Get session sets', async () => {
    const sets = await exerciseService.getSessionSets(testSessionId);
    const testSet = sets.find(s => s.id === testSetId);
    if (!testSet) throw new Error('Test set not found');
    if (testSet.weight !== 60) throw new Error('Set weight mismatch');
    if (testSet.reps !== 5) throw new Error('Set reps mismatch');
  });

  await runTest('Update set', async () => {
    await exerciseService.updateSet(testSetId, {
      weight: 65,
      reps: 6
    });
    const sets = await exerciseService.getSessionSets(testSessionId);
    const updated = sets.find(s => s.id === testSetId);
    if (!updated) throw new Error('Updated set not found');
    if (updated.weight !== 65) throw new Error('Set weight not updated');
    if (updated.reps !== 6) throw new Error('Set reps not updated');
  });

  await runTest('Get last sets for exercise', async () => {
    const lastSets = await exerciseService.getLastSetsForExercise(testExerciseId, 5);
    if (lastSets.length === 0) throw new Error('No last sets found');
    const found = lastSets.find(s => s.id === testSetId);
    if (!found) throw new Error('Test set not in last sets');
  });

  await runTest('Get recent exercises', async () => {
    const recent = await exerciseService.getRecentExercises(10);
    // Test exercise should be in recent after adding a set
    const found = recent.find(e => e.id === testExerciseId);
    if (!found) throw new Error('Test exercise not in recent exercises');
  });

  // ==================== VALIDATION TESTS ====================
  console.log('\n📝 Testing Validation...\n');

  await runTest('Reject negative weight', async () => {
    try {
      await exerciseService.addSet(testSessionId, {
        exerciseId: testExerciseId,
        weight: -10,
        reps: 5,
        isWarmup: false,
        isFailure: false
      });
      throw new Error('Should have rejected negative weight');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('negative')) {
        throw new Error('Wrong error type for negative weight');
      }
    }
  });

  await runTest('Reject negative reps', async () => {
    try {
      await exerciseService.addSet(testSessionId, {
        exerciseId: testExerciseId,
        weight: 50,
        reps: -5,
        isWarmup: false,
        isFailure: false
      });
      throw new Error('Should have rejected negative reps');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('negative')) {
        throw new Error('Wrong error type for negative reps');
      }
    }
  });

  await runTest('Reject empty exercise name', async () => {
    try {
      await exerciseService.createExercise({ name: '' });
      throw new Error('Should have rejected empty name');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('required')) {
        throw new Error('Wrong error type for empty name');
      }
    }
  });

  await runTest('Reject invalid date format', async () => {
    try {
      await workoutService.getOrCreateSession('invalid-date');
      throw new Error('Should have rejected invalid date');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Invalid date')) {
        throw new Error('Wrong error type for invalid date');
      }
    }
  });

  // ==================== BACKUP SERVICE TESTS ====================
  console.log('\n📝 Testing Backup Service...\n');

  await runTest('Get database size', async () => {
    const size = await backupService.getDatabaseSize();
    if (size === 0) throw new Error('Database size is 0');
  });

  await runTest('Get database stats', async () => {
    const stats = await backupService.getDatabaseStats();
    if (stats.exercises === 0) throw new Error('No exercises in stats');
    if (stats.sets === 0) throw new Error('No sets in stats');
    if (stats.workouts === 0) throw new Error('No workouts in stats');
    if (!stats.sizeMB) throw new Error('Size MB missing');
  });

  await runTest('Create auto backup', async () => {
    const backupPath = await backupService.createAutoBackup();
    if (!backupPath) throw new Error('Backup path not returned');
    if (!backupPath.includes('auto_backup_')) throw new Error('Invalid backup path');
  });

  await runTest('List auto backups', async () => {
    const backups = await backupService.listAutoBackups();
    if (!Array.isArray(backups)) throw new Error('Backups is not an array');
    if (backups.length === 0) throw new Error('No backups found');
    const latestBackup = backups[0];
    if (!latestBackup.name) throw new Error('Backup name missing');
    if (!latestBackup.path) throw new Error('Backup path missing');
  });

  // ==================== CACHE TESTS ====================
  console.log('\n📝 Testing Cache Invalidation...\n');

  await runTest('Cache invalidation on exercise update', async () => {
    // Get exercises (caches them)
    await exerciseService.getAllExercises();

    // Update exercise (should invalidate cache)
    await exerciseService.updateExercise(testExerciseId, { name: 'Cache Test' });

    // Get exercises again (should fetch fresh data)
    const exercises = await exerciseService.getAllExercises();
    const updated = exercises.find(e => e.id === testExerciseId);
    if (!updated || updated.name !== 'Cache Test') {
      throw new Error('Cache was not invalidated on update');
    }
  });

  await runTest('Cache invalidation on set add', async () => {
    // Get session sets (caches them)
    await exerciseService.getSessionSets(testSessionId);

    // Add new set (should invalidate cache)
    await exerciseService.addSet(testSessionId, {
      exerciseId: testExerciseId,
      weight: 70,
      reps: 3,
      isWarmup: true,
      isFailure: false
    });

    // Get session sets again (should include new set)
    const sets = await exerciseService.getSessionSets(testSessionId);
    const warmupSets = sets.filter(s => s.isWarmup);
    if (warmupSets.length === 0) {
      throw new Error('Cache was not invalidated - new warmup set not found');
    }
  });

  // ==================== CLEANUP ====================
  console.log('\n📝 Cleaning up test data...\n');

  await runTest('Delete set', async () => {
    await exerciseService.deleteSet(testSetId);
    const sets = await exerciseService.getSessionSets(testSessionId);
    const found = sets.find(s => s.id === testSetId);
    if (found) throw new Error('Set was not deleted');
  });

  await runTest('Delete session', async () => {
    await workoutService.deleteSession(testSessionId);
    try {
      await workoutService.getSessionById(testSessionId);
      throw new Error('Session was not deleted');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('not found')) {
        throw error;
      }
    }
  });

  await runTest('Delete exercise', async () => {
    await exerciseService.deleteExercise(testExerciseId);
    try {
      await exerciseService.getExerciseById(testExerciseId);
      throw new Error('Exercise was not deleted');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('not found')) {
        throw error;
      }
    }
  });

  await runTest('Delete tag', async () => {
    await exerciseService.deleteTag(testTagId);
    const tags = await exerciseService.getAllTags();
    const found = tags.find(t => t.id === testTagId);
    if (found) throw new Error('Tag was not deleted');
  });

  // ==================== SUMMARY ====================
  console.log('\n🎉 ========== SERVICE LAYER TESTS COMPLETE ==========\n');

  const passCount = testResults.filter(t => t.status === 'pass').length;
  const failCount = testResults.filter(t => t.status === 'fail').length;
  const totalCount = testResults.length;

  console.log(`Total Tests: ${totalCount}`);
  console.log(`✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`Success Rate: ${((passCount / totalCount) * 100).toFixed(1)}%\n`);

  if (failCount > 0) {
    console.log('Failed Tests:');
    testResults
      .filter(t => t.status === 'fail')
      .forEach(t => console.log(`  ❌ ${t.name}: ${t.error}`));
    console.log('');
  }

  if (failCount === 0) {
    console.log('🎊 ALL TESTS PASSED! 🎊\n');
  }
}

/**
 * Get test results
 */
export function getTestResults() {
  return testResults;
}
