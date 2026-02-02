/**
 * Session Storage
 *
 * CRUD operations for sessions.
 */

import type { Session } from '@stratuscode/shared';
import { generateId, generateSlug } from '@stratuscode/shared';
import { getDatabase, insert, update, findById, findAll, deleteById } from './database';

// ============================================
// Types
// ============================================

interface SessionRow {
  id: string;
  slug: string;
  title: string;
  project_dir: string;
  parent_id: string | null;
  status: string;
  error: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

// ============================================
// Conversions
// ============================================

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    projectDir: row.project_dir,
    status: row.status as Session['status'],
    toolLoopDepth: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    error: row.error ?? undefined,
  };
}

function sessionToRow(session: Partial<Session> & { id: string }): Partial<SessionRow> {
  const row: Partial<SessionRow> = { id: session.id };
  
  if (session.slug !== undefined) row.slug = session.slug;
  if (session.title !== undefined) row.title = session.title;
  if (session.projectDir !== undefined) row.project_dir = session.projectDir;
  if (session.status !== undefined) row.status = session.status;
  if (session.error !== undefined) row.error = session.error ?? null;
  if (session.createdAt !== undefined) row.created_at = session.createdAt;
  if (session.updatedAt !== undefined) row.updated_at = session.updatedAt;
  if (session.completedAt !== undefined) row.completed_at = session.completedAt ?? null;
  
  return row;
}

// ============================================
// Operations
// ============================================

/**
 * Create a new session
 */
export function createSession(projectDir: string, title?: string): Session {
  const now = Date.now();
  const session: Session = {
    id: generateId('sess'),
    slug: generateSlug(),
    title: title || `New session - ${new Date().toISOString()}`,
    projectDir,
    status: 'pending',
    toolLoopDepth: 0,
    createdAt: now,
    updatedAt: now,
  };

  insert('sessions', {
    id: session.id,
    slug: session.slug,
    title: session.title,
    project_dir: session.projectDir,
    status: session.status,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
  });

  return session;
}

/**
 * Get a session by ID
 */
export function getSession(id: string): Session | undefined {
  const row = findById<SessionRow>('sessions', id);
  return row ? rowToSession(row) : undefined;
}

/**
 * Update a session
 */
export function updateSession(id: string, updates: Partial<Session>): void {
  const row = sessionToRow({ id, ...updates, updatedAt: Date.now() });
  update('sessions', id, row);
}

/**
 * List sessions for a project
 */
export function listSessions(projectDir?: string, limit = 50): Session[] {
  const where = projectDir ? { project_dir: projectDir } : undefined;
  const rows = findAll<SessionRow>('sessions', where, 'updated_at DESC', limit);
  return rows.map(rowToSession);
}

/**
 * List recent sessions across all projects
 */
export function listRecentSessions(limit = 20): Session[] {
  const rows = findAll<SessionRow>('sessions', undefined, 'updated_at DESC', limit);
  return rows.map(rowToSession);
}

/**
 * Delete a session and its messages
 */
export function deleteSession(id: string): void {
  const db = getDatabase();
  
  // Delete in order due to foreign keys
  db.prepare('DELETE FROM tool_calls WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM message_parts WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(id);
  deleteById('sessions', id);
}

/**
 * Get session by slug
 */
export function getSessionBySlug(slug: string): Session | undefined {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM sessions WHERE slug = ?').get(slug) as SessionRow | undefined;
  return row ? rowToSession(row) : undefined;
}
