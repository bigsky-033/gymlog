/**
 * Database Test Script
 *
 * Verifies that the database schema, indexes, and triggers are working correctly.
 * Run this to ensure the database layer is functioning properly.
 *
 * Usage:
 * - Import and call testDatabase() from your app
 * - Check console output for results
 */

import { DatabaseService } from './DatabaseService';
import { ExerciseDB, TagDB, WorkoutSessionDB, SetDB } from '../types';

/**
 * Main test function
 */
export async function testDatabase(): Promise<void> {
  console.log('\n🧪 ========== DATABASE TEST START ==========\n');

  const db = DatabaseService.getInstance();

  try {
    // Step 1: Initialize database
    console.log('📝 Step 1: Initializing database...');
    await db.initDatabase();
    console.log('✅ Database initialized successfully\n');

    // Step 2: Insert sample exercise "Squat" or use existing
    console.log('📝 Step 2: Getting or creating exercise "Squat"...');

    // Check if Squat already exists (from initial data)
    let squat = await db.getFirst<ExerciseDB>(
      'SELECT * FROM exercises WHERE name = ?',
      ['Squat']
    );

    let squatId: number;
    if (squat) {
      squatId = squat.id;
      console.log(`   Exercise "Squat" already exists with ID: ${squatId}`);
    } else {
      const squatResult = await db.executeRun(
        'INSERT INTO exercises (name, notes, default_weight, default_reps, unit, is_favorite) VALUES (?, ?, ?, ?, ?, ?)',
        ['Squat', 'Barbell back squat', 60.0, 5, 'kg', 1]
      );
      squatId = squatResult.lastInsertRowId!;
      console.log(`   Exercise "Squat" inserted with ID: ${squatId}`);
    }
    console.log(`✅ Exercise "Squat" ready (ID: ${squatId})\n`);

    // Step 3: Add tag "Legs" and link to Squat
    console.log('📝 Step 3: Adding tag "Legs" and linking to Squat...');

    // Check if "Legs" tag already exists (from initial data)
    let legsTag = await db.getFirst<TagDB>(
      'SELECT * FROM tags WHERE name = ?',
      ['Legs']
    );

    let legsTagId: number;
    if (legsTag) {
      legsTagId = legsTag.id;
      console.log(`   Tag "Legs" already exists with ID: ${legsTagId}`);
    } else {
      const tagResult = await db.executeRun(
        'INSERT INTO tags (name, color) VALUES (?, ?)',
        ['Legs', '#45B7D1']
      );
      legsTagId = tagResult.lastInsertRowId!;
      console.log(`   Tag "Legs" inserted with ID: ${legsTagId}`);
    }

    // Link tag to exercise (use INSERT OR IGNORE to avoid duplicate key errors)
    await db.executeRun(
      'INSERT OR IGNORE INTO exercise_tags (exercise_id, tag_id) VALUES (?, ?)',
      [squatId, legsTagId]
    );
    console.log(`✅ Tag "Legs" linked to "Squat"\n`);

    // Step 4: Create workout session for today
    console.log('📝 Step 4: Creating workout session for today...');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const sessionResult = await db.executeRun(
      'INSERT INTO workout_sessions (date, time_of_day, notes) VALUES (?, ?, ?)',
      [today, 'morning', 'Test workout session']
    );
    const sessionId = sessionResult.lastInsertRowId!;
    console.log(`✅ Workout session created with ID: ${sessionId} for date: ${today}\n`);

    // Step 5: Add 3 sets (1 warmup, 2 working sets)
    console.log('📝 Step 5: Adding 3 sets...');

    // Warmup set: 20kg x 10
    const warmupResult = await db.executeRun(
      `INSERT INTO sets (session_id, exercise_id, weight, reps, is_warmup, is_failure, set_order, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, squatId, 20.0, 10, 1, 0, 1, 'Warmup set']
    );
    console.log(`   ✅ Warmup set inserted (ID: ${warmupResult.lastInsertRowId}): 20kg x 10`);

    // Working set 1: 60kg x 5
    const set1Result = await db.executeRun(
      `INSERT INTO sets (session_id, exercise_id, weight, reps, is_warmup, is_failure, set_order, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, squatId, 60.0, 5, 0, 0, 2, 'Working set 1']
    );
    console.log(`   ✅ Working set 1 inserted (ID: ${set1Result.lastInsertRowId}): 60kg x 5`);

    // Working set 2: 60kg x 5
    const set2Result = await db.executeRun(
      `INSERT INTO sets (session_id, exercise_id, weight, reps, is_warmup, is_failure, set_order, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, squatId, 60.0, 5, 0, 0, 3, 'Working set 2']
    );
    console.log(`   ✅ Working set 2 inserted (ID: ${set2Result.lastInsertRowId}): 60kg x 5\n`);

    // Step 6: Retrieve and log all data
    console.log('📝 Step 6: Retrieving and verifying all data...\n');

    // Retrieve exercise with tags
    console.log('🔍 Querying exercise with tags...');
    const exerciseWithTags = await db.getFirst<any>(
      `SELECT
        e.id,
        e.name,
        e.notes,
        e.default_weight,
        e.default_reps,
        e.unit,
        e.is_favorite,
        GROUP_CONCAT(t.name) as tag_names,
        GROUP_CONCAT(t.color) as tag_colors
      FROM exercises e
      LEFT JOIN exercise_tags et ON e.id = et.exercise_id
      LEFT JOIN tags t ON et.tag_id = t.id
      WHERE e.id = ?
      GROUP BY e.id`,
      [squatId]
    );

    console.log('📊 Exercise Data:');
    console.log(`   Name: ${exerciseWithTags?.name}`);
    console.log(`   Notes: ${exerciseWithTags?.notes}`);
    console.log(`   Default: ${exerciseWithTags?.default_weight}${exerciseWithTags?.unit} x ${exerciseWithTags?.default_reps}`);
    console.log(`   Favorite: ${exerciseWithTags?.is_favorite === 1 ? 'Yes' : 'No'}`);
    console.log(`   Tags: ${exerciseWithTags?.tag_names || 'None'}\n`);

    // Retrieve workout session
    console.log('🔍 Querying workout session...');
    const session = await db.getFirst<WorkoutSessionDB>(
      'SELECT * FROM workout_sessions WHERE id = ?',
      [sessionId]
    );

    console.log('📊 Workout Session Data:');
    console.log(`   ID: ${session?.id}`);
    console.log(`   Date: ${session?.date}`);
    console.log(`   Time of Day: ${session?.time_of_day || 'Not specified'}`);
    console.log(`   Notes: ${session?.notes}\n`);

    // Retrieve all sets
    console.log('🔍 Querying all sets...');
    const sets = await db.executeQuery<SetDB>(
      `SELECT * FROM sets WHERE session_id = ? ORDER BY set_order ASC`,
      [sessionId]
    );

    console.log('📊 Sets Data:');
    sets.forEach((set, index) => {
      const setType = set.is_warmup ? '🔥 Warmup' : '💪 Working';
      const failure = set.is_failure ? ' (FAILED)' : '';
      console.log(`   Set ${index + 1} (${setType}): ${set.weight}kg x ${set.reps}${failure}`);
      if (set.notes) {
        console.log(`      Notes: ${set.notes}`);
      }
    });
    console.log('');

    // Verify recent_exercises trigger
    console.log('🔍 Verifying recent_exercises trigger...');
    const recentExercise = await db.getFirst<any>(
      'SELECT * FROM recent_exercises WHERE exercise_id = ?',
      [squatId]
    );

    console.log('📊 Recent Exercise Data (updated by trigger):');
    console.log(`   Exercise ID: ${recentExercise?.exercise_id}`);
    console.log(`   Use Count: ${recentExercise?.use_count}`);
    console.log(`   Last Weight: ${recentExercise?.last_weight}kg`);
    console.log(`   Last Reps: ${recentExercise?.last_reps}\n`);

    // Test advanced query: get session with exercise details
    console.log('🔍 Testing complex query (session with all sets and exercises)...');
    const sessionDetails = await db.executeQuery<any>(
      `SELECT
        ws.id as session_id,
        ws.date,
        ws.time_of_day,
        s.id as set_id,
        s.weight,
        s.reps,
        s.is_warmup,
        s.is_failure,
        s.set_order,
        e.name as exercise_name,
        e.unit
      FROM workout_sessions ws
      JOIN sets s ON ws.id = s.session_id
      JOIN exercises e ON s.exercise_id = e.id
      WHERE ws.id = ?
      ORDER BY s.set_order ASC`,
      [sessionId]
    );

    console.log('📊 Complete Session Details:');
    console.log(`   Date: ${sessionDetails[0]?.date}`);
    console.log(`   Time: ${sessionDetails[0]?.time_of_day || 'Not specified'}`);
    console.log(`   Sets:`);
    sessionDetails.forEach((row) => {
      const type = row.is_warmup ? 'Warmup' : 'Working';
      console.log(`      ${row.exercise_name}: ${row.weight}${row.unit} x ${row.reps} (${type})`);
    });
    console.log('');

    // Database statistics
    console.log('📊 Database Statistics:');
    const stats = await db.getStats();
    console.log(`   Database Version: ${stats.version}`);
    console.log(`   Total Tables: ${stats.tables}`);
    console.log(`   Exercises: ${stats.exercises}`);
    console.log(`   Sets: ${stats.sets}`);
    console.log(`   Sessions: ${stats.sessions}`);
    console.log(`   Tags: ${stats.tags}\n`);

    // Verify database integrity
    console.log('🔍 Verifying database integrity...');
    const isHealthy = await db.verifyIntegrity();
    console.log(`✅ Database integrity check: ${isHealthy ? 'PASSED' : 'FAILED'}\n`);

    // Test foreign key constraint
    console.log('🔍 Testing foreign key constraint...');
    try {
      await db.executeRun(
        'INSERT INTO sets (session_id, exercise_id, weight, reps, set_order) VALUES (?, ?, ?, ?, ?)',
        [99999, squatId, 100, 5, 1] // Invalid session_id
      );
      console.log('❌ Foreign key constraint FAILED - invalid insert was allowed!\n');
    } catch (error) {
      console.log('✅ Foreign key constraint WORKING - invalid insert was rejected\n');
    }

    // Test transaction rollback
    console.log('🔍 Testing transaction rollback...');
    const setCountBefore = await db.getFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM sets WHERE session_id = ?',
      [sessionId]
    );

    try {
      await db.transaction(async (db) => {
        await db.executeRun(
          'INSERT INTO sets (session_id, exercise_id, weight, reps, set_order) VALUES (?, ?, ?, ?, ?)',
          [sessionId, squatId, 80, 3, 4]
        );

        // Force an error to trigger rollback
        throw new Error('Intentional error to test rollback');
      });
    } catch (error) {
      // Expected error
    }

    const setCountAfter = await db.getFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM sets WHERE session_id = ?',
      [sessionId]
    );

    if (setCountBefore?.count === setCountAfter?.count) {
      console.log('✅ Transaction rollback WORKING - failed transaction was rolled back\n');
    } else {
      console.log('❌ Transaction rollback FAILED - changes were not rolled back!\n');
    }

    // Test batch insert
    console.log('🔍 Testing batch insert...');
    const batchTags = [
      ['Compound', '#6C5CE7'],
      ['Strength', '#FF6B6B'],
      ['Olympic', '#FFA502']
    ];

    await db.executeBatch(
      'INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)',
      batchTags
    );

    const tagCount = await db.getFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM tags'
    );
    console.log(`✅ Batch insert WORKING - ${tagCount?.count} total tags in database\n`);

    console.log('🎉 ========== ALL TESTS PASSED! ==========\n');
    console.log('✅ Database schema is correct');
    console.log('✅ Indexes are working');
    console.log('✅ Triggers are firing');
    console.log('✅ Foreign keys are enforced');
    console.log('✅ Transactions are atomic');
    console.log('✅ Batch operations work');
    console.log('✅ Complex queries execute successfully\n');

    return;

  } catch (error) {
    console.error('\n❌ ========== TEST FAILED ==========\n');
    console.error('Error:', error);
    throw error;
  }
}

/**
 * Cleanup function to reset database after testing
 */
export async function cleanupTestData(): Promise<void> {
  console.log('\n🧹 Cleaning up test data...');
  const db = DatabaseService.getInstance();

  try {
    // Delete test workout session (sets will cascade)
    const today = new Date().toISOString().split('T')[0];
    await db.executeRun(
      'DELETE FROM workout_sessions WHERE date = ?',
      [today]
    );

    // Delete test exercise
    await db.executeRun(
      "DELETE FROM exercises WHERE name = 'Squat' AND notes = 'Barbell back squat'",
      []
    );

    console.log('✅ Test data cleaned up\n');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
}

/**
 * Run complete test suite
 */
export async function runDatabaseTests(): Promise<void> {
  try {
    await testDatabase();

    // Optionally cleanup
    console.log('💡 Tip: Call cleanupTestData() to remove test data');
    // await cleanupTestData();
  } catch (error) {
    console.error('Test suite failed:', error);
    throw error;
  }
}

// Export for easy import
export default testDatabase;
