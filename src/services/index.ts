/**
 * Service Layer Exports
 *
 * Central export point for all service classes
 */

export { ExerciseService } from './ExerciseService';
export { WorkoutService, type SessionWithStats } from './WorkoutService';
export { BackupService } from './BackupService';

// Convenience function to create service instances
export const createServices = () => ({
  exercise: new ExerciseService(),
  workout: new WorkoutService(),
  backup: new BackupService()
});
