/**
 * Questions Storage
 *
 * Database operations for pending questions (interactive question tool).
 */

import { getDatabase, insert, update, findAll } from './database';
import { generateId } from '@stratuscode/shared';

// ============================================
// Types
// ============================================

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface Question {
  id: string;
  question: string;
  header?: string;
  options: QuestionOption[];
  allowMultiple?: boolean;
  allowCustom?: boolean;
}

export interface PendingQuestionRow {
  id: string;
  session_id: string;
  message_id: string | null;
  tool_call_id: string | null;
  questions: string;
  answers: string | null;
  status: 'pending' | 'answered' | 'skipped';
  created_at: number;
  answered_at: number | null;
}

export interface PendingQuestion {
  id: string;
  sessionId: string;
  messageId?: string;
  toolCallId?: string;
  questions: Question[];
  answers?: string[][];
  status: 'pending' | 'answered' | 'skipped';
  createdAt: number;
  answeredAt?: number;
}

// ============================================
// Conversions
// ============================================

function rowToPendingQuestion(row: PendingQuestionRow): PendingQuestion {
  return {
    id: row.id,
    sessionId: row.session_id,
    messageId: row.message_id || undefined,
    toolCallId: row.tool_call_id || undefined,
    questions: JSON.parse(row.questions),
    answers: row.answers ? JSON.parse(row.answers) : undefined,
    status: row.status,
    createdAt: row.created_at,
    answeredAt: row.answered_at || undefined,
  };
}

// ============================================
// Operations
// ============================================

/**
 * Create a pending question
 */
export function createPendingQuestion(
  sessionId: string,
  questions: Question[],
  options?: { messageId?: string; toolCallId?: string }
): PendingQuestion {
  const now = Date.now();
  const id = generateId('question');

  insert('pending_questions', {
    id,
    session_id: sessionId,
    message_id: options?.messageId || null,
    tool_call_id: options?.toolCallId || null,
    questions: JSON.stringify(questions),
    answers: null,
    status: 'pending',
    created_at: now,
    answered_at: null,
  });

  return {
    id,
    sessionId,
    messageId: options?.messageId,
    toolCallId: options?.toolCallId,
    questions,
    status: 'pending',
    createdAt: now,
  };
}

/**
 * Get pending questions for a session
 */
export function getPendingQuestions(sessionId: string): PendingQuestion[] {
  const rows = findAll<PendingQuestionRow>(
    'pending_questions',
    { session_id: sessionId, status: 'pending' },
    'created_at ASC'
  );
  return rows.map(rowToPendingQuestion);
}

/**
 * Get a pending question by ID
 */
export function getPendingQuestion(id: string): PendingQuestion | undefined {
  const db = getDatabase();
  const stmt = db.query('SELECT * FROM pending_questions WHERE id = ?');
  const row = stmt.get(id) as PendingQuestionRow | undefined;
  return row ? rowToPendingQuestion(row) : undefined;
}

/**
 * Answer a pending question
 */
export function answerQuestion(id: string, answers: string[][]): PendingQuestion | undefined {
  const existing = getPendingQuestion(id);
  if (!existing) return undefined;

  const now = Date.now();
  update('pending_questions', id, {
    answers: JSON.stringify(answers),
    status: 'answered',
    answered_at: now,
  });

  return {
    ...existing,
    answers,
    status: 'answered',
    answeredAt: now,
  };
}

/**
 * Skip a pending question
 */
export function skipQuestion(id: string): PendingQuestion | undefined {
  const existing = getPendingQuestion(id);
  if (!existing) return undefined;

  const now = Date.now();
  update('pending_questions', id, {
    status: 'skipped',
    answered_at: now,
  });

  return {
    ...existing,
    status: 'skipped',
    answeredAt: now,
  };
}

/**
 * Get the first pending question for a session (for TUI to display)
 */
export function getFirstPendingQuestion(sessionId: string): PendingQuestion | undefined {
  const pending = getPendingQuestions(sessionId);
  return pending[0];
}
