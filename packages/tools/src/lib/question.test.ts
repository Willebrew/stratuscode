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
  test('uses default error when none provided', () => {
    // Just ensure it doesn't crash
    expect(() => Question.reject('nonexistent-q2')).not.toThrow();
  });
});

describe('question: full ask + answer lifecycle', () => {
  test('ask creates pending question and answer resolves it', async () => {
    const sessionId = 'q-lifecycle-answer-' + Date.now();
    const answersPromise = Question.ask({
      sessionId,
      questions: [{ question: 'Pick color', options: [{ label: 'Red' }, { label: 'Blue' }] }],
    });
    // getPending should now have the question
    const pending = Question.getPending(sessionId);
    expect(pending.length).toBe(1);
    expect(pending[0].status).toBe('pending');
    expect(pending[0].questions[0].question).toBe('Pick color');
    expect(pending[0].questions[0].options).toEqual([{ label: 'Red' }, { label: 'Blue' }]);
    // hasPending should be true
    expect(Question.hasPending(sessionId)).toBe(true);
    // getFirst should return it
    const first = Question.getFirst(sessionId);
    expect(first).toBeDefined();
    expect(first!.id).toBe(pending[0].id);
    // Answer it
    Question.answer(pending[0].id, [['Red']]);
    const answers = await answersPromise;
    expect(answers).toEqual([['Red']]);
  });

  test('ask + skip rejects with SkippedError', async () => {
    const sessionId = 'q-lifecycle-skip-' + Date.now();
    const answersPromise = Question.ask({
      sessionId,
      questions: [{ question: 'Pick?', options: [{ label: 'A' }] }],
    });
    const pending = Question.getPending(sessionId);
    Question.skip(pending[0].id);
    await expect(answersPromise).rejects.toBeInstanceOf(QuestionSkippedError);
  });

  test('ask + reject rejects with RejectedError', async () => {
    const sessionId = 'q-lifecycle-reject-' + Date.now();
    const answersPromise = Question.ask({
      sessionId,
      questions: [{ question: 'Pick?', options: [{ label: 'A' }] }],
    });
    const pending = Question.getPending(sessionId);
    Question.reject(pending[0].id);
    await expect(answersPromise).rejects.toBeInstanceOf(QuestionRejectedError);
  });

  test('ask + reject with custom error', async () => {
    const sessionId = 'q-lifecycle-reject-custom-' + Date.now();
    const answersPromise = Question.ask({
      sessionId,
      questions: [{ question: 'Pick?', options: [{ label: 'A' }] }],
    });
    const pending = Question.getPending(sessionId);
    Question.reject(pending[0].id, new Error('custom rejection'));
    await expect(answersPromise).rejects.toThrow('custom rejection');
  });

  test('ask with tool metadata', async () => {
    const sessionId = 'q-lifecycle-tool-' + Date.now();
    const answersPromise = Question.ask({
      sessionId,
      questions: [{ question: 'Confirm?', options: [{ label: 'Yes' }] }],
      tool: { messageId: 'msg-1', callId: 'call-1' },
    });
    const pending = Question.getPending(sessionId);
    expect(pending.length).toBe(1);
    expect(pending[0].messageId).toBe('msg-1');
    expect(pending[0].toolCallId).toBe('call-1');
    Question.answer(pending[0].id, [['Yes']]);
    const answers = await answersPromise;
    expect(answers).toEqual([['Yes']]);
  });
});
