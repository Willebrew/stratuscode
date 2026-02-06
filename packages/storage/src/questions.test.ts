/**
 * Questions Storage Tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initDatabase, closeDatabase } from './database';
import { createPendingQuestion, getPendingQuestions, answerQuestion, skipQuestion, getPendingQuestion, getFirstPendingQuestion } from './questions';

describe('Questions Storage', () => {
  const testSessionId = 'test-session-questions';

  beforeAll(() => {
    initDatabase({ dataDir: '/tmp/stratuscode-test' });
  });

  afterAll(() => {
    closeDatabase();
  });

  test('createPendingQuestion creates a question', () => {
    const question = createPendingQuestion(testSessionId, [
      {
        id: 'q1',
        question: 'What framework?',
        options: [
          { label: 'React' },
          { label: 'Vue' },
        ],
      },
    ]);

    expect(question).toBeDefined();
    expect(question.id).toMatch(/^question_/);
    expect(question.status).toBe('pending');
    expect(question.questions.length).toBe(1);
  });

  test('getPendingQuestions returns pending questions', () => {
    const pending = getPendingQuestions(testSessionId);
    
    expect(Array.isArray(pending)).toBe(true);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0]?.status).toBe('pending');
  });

  test('answerQuestion marks as answered', () => {
    const question = createPendingQuestion(testSessionId, [
      { id: 'q2', question: 'Pick one', options: [{ label: 'A' }, { label: 'B' }] },
    ]);

    const answered = answerQuestion(question.id, [['A']]);

    expect(answered).toBeDefined();
    expect(answered?.status).toBe('answered');
    expect(answered?.answers).toEqual([['A']]);
  });

  test('skipQuestion marks as skipped', () => {
    const question = createPendingQuestion(testSessionId, [
      { id: 'q3', question: 'Skip me', options: [{ label: 'X' }] },
    ]);

    const skipped = skipQuestion(question.id);

    expect(skipped).toBeDefined();
    expect(skipped?.status).toBe('skipped');
  });

  test('getPendingQuestion returns a question by ID', () => {
    const created = createPendingQuestion('test-gpq', [
      { id: 'q-gpq', question: 'Test?', options: [{ label: 'Yes' }] },
    ]);
    const result = getPendingQuestion(created.id);
    expect(result).toBeDefined();
    expect(result!.id).toBe(created.id);
    expect(result!.status).toBe('pending');
  });

  test('getPendingQuestion returns undefined for non-existent ID', () => {
    const result = getPendingQuestion('question_nonexistent');
    expect(result).toBeUndefined();
  });

  test('getFirstPendingQuestion returns first pending question for session', () => {
    const sid = `first-pending-${Date.now()}`;
    const q1 = createPendingQuestion(sid, [
      { id: 'fp1', question: 'First?', options: [{ label: 'A' }] },
    ]);
    createPendingQuestion(sid, [
      { id: 'fp2', question: 'Second?', options: [{ label: 'B' }] },
    ]);

    const first = getFirstPendingQuestion(sid);
    expect(first).toBeDefined();
    expect(first!.id).toBe(q1.id);
  });

  test('getFirstPendingQuestion returns undefined when no pending questions', () => {
    const result = getFirstPendingQuestion('session-no-questions');
    expect(result).toBeUndefined();
  });
});
