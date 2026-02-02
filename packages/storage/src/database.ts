/**
 * Database Management
 *
 * SQLite database for session and message persistence.
 * Uses Bun's built-in SQLite for native performance.
 */

import { Database } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================
// Types
// ============================================

export interface StorageConfig {
  dataDir?: string;
}

// ============================================
// Database
// ============================================

let db: Database | null = null;
let dataDir: string;

/**
 * Get the data directory
 */
export function getDataDir(): string {
  if (!dataDir) {
    dataDir = path.join(os.homedir(), '.stratuscode');
  }
  return dataDir;
}

/**
 * Initialize the database
 */
export function initDatabase(config?: StorageConfig): Database {
  if (db) return db;

  dataDir = config?.dataDir || getDataDir();

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'stratuscode.db');
  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.exec('PRAGMA journal_mode = WAL');

  // Create tables
  createTables(db);

  return db;
}

/**
 * Get the database instance
 */
export function getDatabase(): Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Close the database
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ============================================
// Schema
// ============================================

function createTables(db: Database): void {
  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      project_dir TEXT NOT NULL,
      parent_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER,
      FOREIGN KEY (parent_id) REFERENCES sessions(id)
    )
  `);

  // Messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      parent_id TEXT,
      role TEXT NOT NULL,
      content TEXT,
      reasoning TEXT,
      finish_reason TEXT,
      cost REAL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (parent_id) REFERENCES messages(id)
    )
  `);

  // Message parts table (for streaming/tool calls)
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_parts (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  // Tool calls table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      arguments TEXT NOT NULL,
      result TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at INTEGER,
      completed_at INTEGER,
      FOREIGN KEY (message_id) REFERENCES messages(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  // Todos table
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT DEFAULT 'medium',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  // Pending questions table (for interactive question tool)
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_questions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      message_id TEXT,
      tool_call_id TEXT,
      questions TEXT NOT NULL,
      answers TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      answered_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_dir);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_message_parts_message ON message_parts(message_id);
    CREATE INDEX IF NOT EXISTS idx_tool_calls_message ON tool_calls(message_id);
    CREATE INDEX IF NOT EXISTS idx_todos_session ON todos(session_id);
    CREATE INDEX IF NOT EXISTS idx_pending_questions_session ON pending_questions(session_id);
  `);
}

// ============================================
// Generic CRUD helpers
// ============================================

export function insert<T extends Record<string, unknown>>(
  table: string,
  data: T
): void {
  const db = getDatabase();
  const columns = Object.keys(data);
  const values = Object.values(data) as (string | number | boolean | null | Uint8Array)[];
  const placeholders = columns.map(() => '?').join(', ');

  const stmt = db.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
  );
  stmt.run(...values);
}

export function update<T extends Record<string, unknown>>(
  table: string,
  id: string,
  data: Partial<T>
): void {
  const db = getDatabase();
  const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(data), id] as (string | number | boolean | null | Uint8Array)[];

  const stmt = db.query(`UPDATE ${table} SET ${sets} WHERE id = ?`);
  stmt.run(...values);
}

export function findById<T>(table: string, id: string): T | undefined {
  const db = getDatabase();
  const stmt = db.query(`SELECT * FROM ${table} WHERE id = ?`);
  return stmt.get(id) as T | undefined;
}

type SQLValue = string | number | boolean | null | Uint8Array;

export function findAll<T>(
  table: string,
  where?: Record<string, unknown>,
  orderBy?: string,
  limit?: number
): T[] {
  const db = getDatabase();
  
  let sql = `SELECT * FROM ${table}`;
  const values: SQLValue[] = [];

  if (where && Object.keys(where).length > 0) {
    const conditions = Object.keys(where).map(k => `${k} = ?`).join(' AND ');
    sql += ` WHERE ${conditions}`;
    values.push(...(Object.values(where) as SQLValue[]));
  }

  if (orderBy) {
    sql += ` ORDER BY ${orderBy}`;
  }

  if (limit) {
    sql += ` LIMIT ${limit}`;
  }

  const stmt = db.query(sql);
  return stmt.all(...values) as T[];
}

export function deleteById(table: string, id: string): void {
  const db = getDatabase();
  const stmt = db.query(`DELETE FROM ${table} WHERE id = ?`);
  stmt.run(id);
}
