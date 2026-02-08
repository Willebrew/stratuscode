/**
 * Mock @stratuscode/storage for cloud environment
 * This prevents the tools package from trying to import bun:sqlite
 */

// Re-export everything from storage-shim
export * from './storage-shim';

// Mock any additional storage functions that tools might need
export function initDatabase() {
  // No-op in cloud
}

export function getDatabase() {
  return null;
}
