import { describe, expect, test } from 'bun:test';
import { Question, QuestionRejectedError, QuestionSkippedError } from './question';

describe('question: error types', () => {
  test('QuestionRejectedError has correct name and message', () => {
    const err = new QuestionRejectedError();
    expect(err.name).toBe('QuestionRejectedError');
    expect(err.message).toBe('User rejected the question');
  });

  test('QuestionRejectedError accepts custom message', () => {
    const err = new QuestionRejectedError('custom');
    expect(err.message).toBe('custom');
  });

  test('QuestionSkippedError has correct name and message', () => {
    const err = new QuestionSkippedError();
    expect(err.name).toBe('QuestionSkippedError');
    expect(err.message).toBe('User skipped the question');
  });
});

describe('question: Question.getPending', () => {
  test('returns empty array for unknown session', () => {
    const pending = Question.getPending('nonexistent-session');
    expect(pending).toEqual([]);
  });

  test('hasPending returns false for unknown session', () => {
    expect(Question.hasPending('nonexistent-session')).toBe(false);
  });
});

describe('question: Question.getFirst', () => {
  test('returns undefined for unknown session', () => {
    expect(Question.getFirst('nonexistent-session')).toBeUndefined();
  });
});

describe('question: Question.answer', () => {
  test('does not throw for unknown question id', () => {
    expect(() => Question.answer('nonexistent-q', [['a']])).not.toThrow();
  });
});

describe('question: Question.skip', () => {
  test('does not throw for unknown question id', () => {
    expect(() => Question.skip('nonexistent-q')).not.toThrow();
  });
});

describe('question: Question.reject', () => {
  test('does not throw for unknown question id', () => {
    expect(() => Question.reject('nonexistent-q')).not.toThrow();
  });
});
