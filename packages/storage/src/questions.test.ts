/**
 * Questions Storage Tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initDatabase, closeDatabase } from './database';
import { createPendingQuestion, getPendingQuestions, answerQuestion, skipQuestion } from './questions';

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
});
