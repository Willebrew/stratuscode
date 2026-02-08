import { describe, expect, test } from 'bun:test';
import { questionTool } from './question';
import { Question, QuestionSkippedError, QuestionRejectedError } from './lib/question';

describe('question tool', () => {
  test('returns error when no session id', async () => {
    const result = await questionTool.execute(
      { questions: [{ question: 'Pick one', options: [{ label: 'A' }] }] },
      { sessionId: '', metadata: { projectDir: '/tmp' } } as any
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe('No active session');
  });

  test('returns answers on successful ask', async () => {
    const sid = 'qtool-success-' + Date.now();
    const resultPromise = questionTool.execute(
      { questions: [{ question: 'Pick color', options: [{ label: 'Red' }, { label: 'Blue' }] }] },
      { sessionId: sid, metadata: { projectDir: '/tmp' } } as any
    );
    await new Promise(r => setTimeout(r, 10));
    const pending = Question.getPending(sid);
    expect(pending.length).toBe(1);
    Question.answer(pending[0].id, [['Red']]);
    const result = await resultPromise;
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.answers[0].question).toBe('Pick color');
    expect(parsed.answers[0].selectedOptions).toEqual(['Red']);
  });

  test('returns skipped when user skips', async () => {
    const sid = 'qtool-skip-' + Date.now();
    const resultPromise = questionTool.execute(
      { questions: [{ question: 'Pick?', options: [{ label: 'A' }] }] },
      { sessionId: sid, metadata: { projectDir: '/tmp' } } as any
    );
    await new Promise(r => setTimeout(r, 10));
    const pending = Question.getPending(sid);
    Question.skip(pending[0].id);
    const result = await resultPromise;
    const parsed = JSON.parse(result as string);
    expect(parsed.skipped).toBe(true);
    expect(parsed.message).toContain('skipped');
  });

  test('returns rejected when user rejects', async () => {
    const sid = 'qtool-reject-' + Date.now();
    const resultPromise = questionTool.execute(
      { questions: [{ question: 'Pick?', options: [{ label: 'A' }] }] },
      { sessionId: sid, metadata: { projectDir: '/tmp' } } as any
    );
    await new Promise(r => setTimeout(r, 10));
    const pending = Question.getPending(sid);
    Question.reject(pending[0].id);
    const result = await resultPromise;
    const parsed = JSON.parse(result as string);
    expect(parsed.rejected).toBe(true);
    expect(parsed.message).toContain('rejected');
  });

  test('re-throws unknown errors', async () => {
    const sid = 'qtool-error-' + Date.now();
    const resultPromise = questionTool.execute(
      { questions: [{ question: 'Pick?', options: [{ label: 'A' }] }] },
      { sessionId: sid, metadata: { projectDir: '/tmp' } } as any
    );
    await new Promise(r => setTimeout(r, 10));
    const pending = Question.getPending(sid);
    Question.reject(pending[0].id, new Error('network failure'));
    await expect(resultPromise).rejects.toThrow('network failure');
  });

  test('passes multiple questions with header and options', async () => {
    const sid = 'qtool-multi-' + Date.now();
    const resultPromise = questionTool.execute(
      {
        questions: [
          { question: 'Confirm?', header: 'Auth', options: [{ label: 'Yes' }, { label: 'No' }], allowMultiple: false, allowCustom: true },
          { question: 'Speed?', options: [{ label: 'Fast' }, { label: 'Slow' }] },
        ],
      },
      { sessionId: sid, metadata: { projectDir: '/tmp' } } as any
    );
    await new Promise(r => setTimeout(r, 10));
    const pending = Question.getPending(sid);
    Question.answer(pending[0].id, [['Yes'], ['Fast']]);
    const result = await resultPromise;
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.answers.length).toBe(2);
    expect(parsed.answers[0].question).toBe('Confirm?');
    expect(parsed.answers[1].question).toBe('Speed?');
  });
});
