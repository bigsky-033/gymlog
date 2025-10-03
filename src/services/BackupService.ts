/**
 * BackupService
 *
 * Service for database backup, restore, and export functionality
 * Uses modern Expo FileSystem API (not legacy)
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { DatabaseService } from '../database/DatabaseService';
import { FileError, parseSQLiteError, logError } from '../utils/errors';

export class BackupService {
  private db: DatabaseService;
  private readonly DB_NAME = 'exercise_tracker.db';

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  /**
   * Get database file path
   */
  private getDbPath(): string {
    return `${FileSystem.documentDirectory}SQLite/${this.DB_NAME}`;
  }

  /**
   * Export database to file and share it
   * Returns the backup file path
   */
  async exportDatabase(): Promise<string> {
    try {
      const dbPath = this.getDbPath();
      const timestamp = new Date().toISOString().split('T')[0];
      const backupFileName = `exercise_tracker_backup_${timestamp}.db`;
      const backupPath = `${FileSystem.cacheDirectory}${backupFileName}`;

      // Check if database exists
      const dbInfo = await FileSystem.getInfoAsync(dbPath);
      if (!dbInfo.exists) {
        throw new FileError('Database file not found', 'read', dbPath);
      }

      // Copy database file to cache directory for sharing
      await FileSystem.copyAsync({
        from: dbPath,
        to: backupPath
      });

      // Share the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(backupPath, {
          mimeType: 'application/x-sqlite3',
          dialogTitle: 'Export Exercise Tracker Database',
          UTI: 'public.database'
        });
      } else {
        throw new FileError('Sharing is not available on this device', 'write');
      }

      return backupPath;
    } catch (error) {
      logError(error, { method: 'exportDatabase' });
      if (error instanceof FileError) throw error;
      throw new FileError(
        `Failed to export database: ${error instanceof Error ? error.message : String(error)}`,
        'copy'
      );
    }
  }

  /**
   * Import database from file
   * Creates a backup of current database before importing
   */
  async importDatabase(): Promise<void> {
    try {
      // Pick file using document picker
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/x-sqlite3',
        copyToCacheDirectory: true
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        // User cancelled
        return;
      }

      const selectedFile = result.assets[0];
      const dbPath = this.getDbPath();

      // Backup current database first
      const backupPath = `${dbPath}.backup_${Date.now()}`;
      await FileSystem.copyAsync({
        from: dbPath,
        to: backupPath
      });

      try {
        // Close current database connection
        await this.db.close();

        // Copy imported file to database location
        await FileSystem.copyAsync({
          from: selectedFile.uri,
          to: dbPath
        });

        // Reinitialize database
        await this.db.initDatabase();

        // Verify integrity
        await this.verifyDatabaseIntegrity();

        // Clean up backup on success
        await FileSystem.deleteAsync(backupPath, { idempotent: true });
      } catch (error) {
        // Restore backup on failure
        await FileSystem.copyAsync({
          from: backupPath,
          to: dbPath
        });

        // Reinitialize with restored database
        await this.db.initDatabase();

        throw error;
      }
    } catch (error) {
      logError(error, { method: 'importDatabase' });
      if (error instanceof FileError) throw error;
      throw new FileError(
        `Failed to import database: ${error instanceof Error ? error.message : String(error)}`,
        'copy'
      );
    }
  }

  /**
   * Export workout data to CSV format
   */
  async exportToCSV(): Promise<string> {
    try {
      const sets = await this.db.executeQuery<any>(`
        SELECT
          ws.date,
          ws.time_of_day,
          e.name as exercise,
          s.weight,
          s.reps,
          s.is_warmup,
          s.is_failure,
          s.set_order,
          s.notes
        FROM sets s
        JOIN workout_sessions ws ON s.session_id = ws.id
        JOIN exercises e ON s.exercise_id = e.id
        ORDER BY ws.date DESC, ws.time_of_day, s.set_order ASC
      `);

      // Create CSV content
      const headers = 'Date,TimeOfDay,Exercise,Weight,Reps,Warmup,Failure,SetOrder,Notes';
      const rows = sets.map(s =>
        `${s.date},${s.time_of_day || ''},${s.exercise},${s.weight},${s.reps},${s.is_warmup ? 'Yes' : 'No'},${s.is_failure ? 'Yes' : 'No'},${s.set_order},"${(s.notes || '').replace(/"/g, '""')}"`
      );

      const csvContent = [headers, ...rows].join('\n');
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `exercise_tracker_${timestamp}.csv`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;

      // Write CSV file
      await FileSystem.writeAsStringAsync(filePath, csvContent, {
        encoding: FileSystem.EncodingType.UTF8
      });

      // Share the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Exercise Data as CSV'
        });
      } else {
        throw new FileError('Sharing is not available on this device', 'write');
      }

      return filePath;
    } catch (error) {
      logError(error, { method: 'exportToCSV' });
      if (error instanceof FileError) throw error;
      throw new FileError(
        `Failed to export CSV: ${error instanceof Error ? error.message : String(error)}`,
        'write'
      );
    }
  }

  /**
   * Export exercises data to JSON
   */
  async exportExercisesToJSON(): Promise<string> {
    try {
      const exercises = await this.db.executeQuery<any>(`
        SELECT
          e.id,
          e.name,
          e.notes,
          e.default_weight,
          e.default_reps,
          e.unit,
          e.is_favorite,
          GROUP_CONCAT(t.name) as tags
        FROM exercises e
        LEFT JOIN exercise_tags et ON e.id = et.exercise_id
        LEFT JOIN tags t ON et.tag_id = t.id
        GROUP BY e.id
        ORDER BY e.name
      `);

      const data = exercises.map(e => ({
        name: e.name,
        notes: e.notes,
        defaultWeight: e.default_weight,
        defaultReps: e.default_reps,
        unit: e.unit,
        isFavorite: e.is_favorite === 1,
        tags: e.tags ? e.tags.split(',') : []
      }));

      const jsonContent = JSON.stringify(data, null, 2);
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `exercises_${timestamp}.json`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;

      // Write JSON file
      await FileSystem.writeAsStringAsync(filePath, jsonContent, {
        encoding: FileSystem.EncodingType.UTF8
      });

      // Share the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/json',
          dialogTitle: 'Export Exercises as JSON'
        });
      } else {
        throw new FileError('Sharing is not available on this device', 'write');
      }

      return filePath;
    } catch (error) {
      logError(error, { method: 'exportExercisesToJSON' });
      if (error instanceof FileError) throw error;
      throw new FileError(
        `Failed to export JSON: ${error instanceof Error ? error.message : String(error)}`,
        'write'
      );
    }
  }

  /**
   * Create automatic backup
   * Saves to app's document directory with timestamp
   */
  async createAutoBackup(): Promise<string> {
    try {
      const dbPath = this.getDbPath();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `auto_backup_${timestamp}.db`;
      const backupPath = `${FileSystem.documentDirectory}backups/${backupFileName}`;

      // Create backups directory if it doesn't exist
      const backupDir = `${FileSystem.documentDirectory}backups/`;
      const dirInfo = await FileSystem.getInfoAsync(backupDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });
      }

      // Copy database file
      await FileSystem.copyAsync({
        from: dbPath,
        to: backupPath
      });

      // Clean up old backups (keep last 5)
      await this.cleanupOldBackups();

      return backupPath;
    } catch (error) {
      logError(error, { method: 'createAutoBackup' });
      throw new FileError(
        `Failed to create auto backup: ${error instanceof Error ? error.message : String(error)}`,
        'copy'
      );
    }
  }

  /**
   * Clean up old backup files (keep last 5)
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backupDir = `${FileSystem.documentDirectory}backups/`;
      const dirInfo = await FileSystem.getInfoAsync(backupDir);

      if (!dirInfo.exists) {
        return;
      }

      const files = await FileSystem.readDirectoryAsync(backupDir);
      const backupFiles = files
        .filter(f => f.startsWith('auto_backup_') && f.endsWith('.db'))
        .sort()
        .reverse(); // Most recent first

      // Keep only last 5
      const filesToDelete = backupFiles.slice(5);

      for (const file of filesToDelete) {
        await FileSystem.deleteAsync(`${backupDir}${file}`, { idempotent: true });
      }
    } catch (error) {
      logError(error, { method: 'cleanupOldBackups' });
      // Don't throw - cleanup is best effort
    }
  }

  /**
   * List available auto backups
   */
  async listAutoBackups(): Promise<Array<{
    name: string;
    path: string;
    size: number;
    modificationTime: number;
  }>> {
    try {
      const backupDir = `${FileSystem.documentDirectory}backups/`;
      const dirInfo = await FileSystem.getInfoAsync(backupDir);

      if (!dirInfo.exists) {
        return [];
      }

      const files = await FileSystem.readDirectoryAsync(backupDir);
      const backupFiles = files.filter(f => f.startsWith('auto_backup_') && f.endsWith('.db'));

      const backups = await Promise.all(
        backupFiles.map(async (file) => {
          const path = `${backupDir}${file}`;
          const info = await FileSystem.getInfoAsync(path);

          return {
            name: file,
            path,
            size: info.exists && 'size' in info ? info.size : 0,
            modificationTime: info.exists && 'modificationTime' in info ? info.modificationTime : 0
          };
        })
      );

      // Sort by modification time (newest first)
      return backups.sort((a, b) => b.modificationTime - a.modificationTime);
    } catch (error) {
      logError(error, { method: 'listAutoBackups' });
      return [];
    }
  }

  /**
   * Restore from auto backup
   */
  async restoreFromAutoBackup(backupPath: string): Promise<void> {
    try {
      const dbPath = this.getDbPath();

      // Verify backup file exists
      const backupInfo = await FileSystem.getInfoAsync(backupPath);
      if (!backupInfo.exists) {
        throw new FileError('Backup file not found', 'read', backupPath);
      }

      // Create safety backup of current database
      const safetyBackup = `${dbPath}.before_restore`;
      await FileSystem.copyAsync({
        from: dbPath,
        to: safetyBackup
      });

      try {
        // Close current database
        await this.db.close();

        // Restore from backup
        await FileSystem.copyAsync({
          from: backupPath,
          to: dbPath
        });

        // Reinitialize
        await this.db.initDatabase();

        // Verify integrity
        await this.verifyDatabaseIntegrity();

        // Clean up safety backup on success
        await FileSystem.deleteAsync(safetyBackup, { idempotent: true });
      } catch (error) {
        // Restore safety backup on failure
        await FileSystem.copyAsync({
          from: safetyBackup,
          to: dbPath
        });

        await this.db.initDatabase();

        throw error;
      }
    } catch (error) {
      logError(error, { method: 'restoreFromAutoBackup', backupPath });
      if (error instanceof FileError) throw error;
      throw new FileError(
        `Failed to restore from backup: ${error instanceof Error ? error.message : String(error)}`,
        'copy'
      );
    }
  }

  /**
   * Verify database integrity
   */
  private async verifyDatabaseIntegrity(): Promise<void> {
    try {
      // Run SQLite integrity check
      const integrityCheck = await this.db.executeQuery<{ integrity_check: string }>(
        'PRAGMA integrity_check'
      );

      if (integrityCheck[0]?.integrity_check !== 'ok') {
        throw new FileError('Database integrity check failed', 'read');
      }

      // Check required tables exist
      const tables = await this.db.executeQuery<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table'"
      );

      const requiredTables = [
        'exercises',
        'sets',
        'workout_sessions',
        'tags',
        'profile',
        'exercise_tags',
        'recent_exercises',
        'app_metadata'
      ];

      const tableNames = tables.map(t => t.name);

      for (const required of requiredTables) {
        if (!tableNames.includes(required)) {
          throw new FileError(`Required table "${required}" not found in database`, 'read');
        }
      }
    } catch (error) {
      logError(error, { method: 'verifyDatabaseIntegrity' });
      throw parseSQLiteError(error, 'verifyDatabaseIntegrity');
    }
  }

  /**
   * Get database file size
   */
  async getDatabaseSize(): Promise<number> {
    try {
      const dbPath = this.getDbPath();
      const info = await FileSystem.getInfoAsync(dbPath);

      if (info.exists && 'size' in info) {
        return info.size;
      }

      return 0;
    } catch (error) {
      logError(error, { method: 'getDatabaseSize' });
      return 0;
    }
  }

  /**
   * Get database statistics for display
   */
  async getDatabaseStats(): Promise<{
    sizeBytes: number;
    sizeMB: string;
    exercises: number;
    workouts: number;
    sets: number;
    tags: number;
  }> {
    try {
      const size = await this.getDatabaseSize();
      const stats = await this.db.getStats();

      return {
        sizeBytes: size,
        sizeMB: (size / (1024 * 1024)).toFixed(2),
        exercises: stats.exercises,
        workouts: stats.sessions,
        sets: stats.sets,
        tags: stats.tags
      };
    } catch (error) {
      logError(error, { method: 'getDatabaseStats' });
      throw parseSQLiteError(error, 'getDatabaseStats');
    }
  }
}
