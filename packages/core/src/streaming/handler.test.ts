/**
 * Stream Handler Tests
 *
 * Tests for handleNormalizedEvent, createAccumulator, and eventToChunk.
 */

import { describe, test, expect } from 'bun:test';
import { handleNormalizedEvent, createAccumulator, eventToChunk } from './handler';
import type { StreamAccumulator, StreamCallbacks } from './handler';

// ============================================
// createAccumulator
// ============================================

describe('createAccumulator', () => {
  test('returns fresh accumulator with empty defaults', () => {
    const acc = createAccumulator();
    expect(acc.content).toBe('');
    expect(acc.reasoning).toBe('');
    expect(acc.toolCalls).toEqual([]);
    expect(acc.inputTokens).toBe(0);
    expect(acc.outputTokens).toBe(0);
    expect(acc.responseId).toBeUndefined();
  });
});

// ============================================
// handleNormalizedEvent
// ============================================

describe('handleNormalizedEvent', () => {
  test('accumulates text_delta', () => {
    const acc = createAccumulator();
    handleNormalizedEvent({ type: 'text_delta', delta: 'Hello' }, acc);
    handleNormalizedEvent({ type: 'text_delta', delta: ' world' }, acc);
    expect(acc.content).toBe('Hello world');
  });

  test('fires onToken callback for text_delta', () => {
    const tokens: string[] = [];
    const acc = createAccumulator();
    handleNormalizedEvent(
      { type: 'text_delta', delta: 'hi' },
      acc,
      { onToken: (t) => tokens.push(t) }
    );
    expect(tokens).toEqual(['hi']);
  });

  test('accumulates reasoning_delta', () => {
    const acc = createAccumulator();
    handleNormalizedEvent({ type: 'reasoning_delta', delta: 'thinking' }, acc);
    handleNormalizedEvent({ type: 'reasoning_delta', delta: '...' }, acc);
    expect(acc.reasoning).toBe('thinking...');
  });

  test('fires onReasoning callback', () => {
    const reasoning: string[] = [];
    const acc = createAccumulator();
    handleNormalizedEvent(
      { type: 'reasoning_delta', delta: 'step 1' },
      acc,
      { onReasoning: (r) => reasoning.push(r) }
    );
    expect(reasoning).toEqual(['step 1']);
  });

  test('handles tool_call_start', () => {
    const acc = createAccumulator();
    handleNormalizedEvent(
      { type: 'tool_call_start', id: 'call_1', name: 'bash', index: 0 },
      acc
    );
    expect(acc.toolCalls).toHaveLength(1);
    expect(acc.toolCalls[0]!.id).toBe('call_1');
    expect(acc.toolCalls[0]!.function.name).toBe('bash');
    expect(acc.toolCalls[0]!.function.arguments).toBe('');
  });

  test('fires onToolCallStart callback', () => {
    const starts: any[] = [];
    const acc = createAccumulator();
    handleNormalizedEvent(
      { type: 'tool_call_start', id: 'call_1', name: 'read', index: 0 },
      acc,
      { onToolCallStart: (tc) => starts.push(tc) }
    );
    expect(starts).toEqual([{ id: 'call_1', name: 'read' }]);
  });

  test('accumulates tool_call_delta arguments', () => {
    const acc = createAccumulator();
    handleNormalizedEvent(
      { type: 'tool_call_start', id: 'call_1', name: 'bash', index: 0 },
      acc
    );
    handleNormalizedEvent(
      { type: 'tool_call_delta', id: 'call_1', delta: '{"cmd":', index: 0 },
      acc
    );
    handleNormalizedEvent(
      { type: 'tool_call_delta', id: 'call_1', delta: '"ls"}', index: 0 },
      acc
    );
    expect(acc.toolCalls[0]!.function.arguments).toBe('{"cmd":"ls"}');
  });

  test('handles tool_call_done - finalizes arguments', () => {
    const acc = createAccumulator();
    handleNormalizedEvent(
      { type: 'tool_call_start', id: 'call_1', name: 'bash', index: 0 },
      acc
    );
    handleNormalizedEvent(
      { type: 'tool_call_done', id: 'call_1', name: 'bash', arguments: '{"command":"ls"}' },
      acc
    );
    expect(acc.toolCalls[0]!.function.arguments).toBe('{"command":"ls"}');
  });

  test('fires onToolCallComplete callback', () => {
    const completed: any[] = [];
    const acc = createAccumulator();
    handleNormalizedEvent(
      { type: 'tool_call_start', id: 'call_1', name: 'bash', index: 0 },
      acc
    );
    handleNormalizedEvent(
      { type: 'tool_call_done', id: 'call_1', name: 'bash', arguments: '{}' },
      acc,
      { onToolCallComplete: (tc) => completed.push(tc) }
    );
    expect(completed).toHaveLength(1);
    expect(completed[0].id).toBe('call_1');
  });

  test('updates response_meta with usage', () => {
    const acc = createAccumulator();
    handleNormalizedEvent(
      { type: 'response_meta', responseId: 'resp_123', usage: { inputTokens: 50, outputTokens: 25 } },
      acc
    );
    expect(acc.responseId).toBe('resp_123');
    expect(acc.inputTokens).toBe(50);
    expect(acc.outputTokens).toBe(25);
  });

  test('updates response_meta without usage', () => {
    const acc = createAccumulator();
    handleNormalizedEvent(
      { type: 'response_meta', responseId: 'resp_456' },
      acc
    );
    expect(acc.responseId).toBe('resp_456');
    expect(acc.inputTokens).toBe(0); // unchanged
  });

  test('fires onError callback for error events', () => {
    const errors: Error[] = [];
    const acc = createAccumulator();
    handleNormalizedEvent(
      { type: 'error', message: 'API error: rate limit' },
      acc,
      { onError: (e) => errors.push(e) }
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('API error: rate limit');
  });

  test('fires onComplete callback for done events', () => {
    let completedAcc: StreamAccumulator | undefined;
    const acc = createAccumulator();
    acc.content = 'final content';
    handleNormalizedEvent(
      { type: 'done' },
      acc,
      { onComplete: (a) => { completedAcc = a; } }
    );
    expect(completedAcc).toBeDefined();
    expect(completedAcc!.content).toBe('final content');
  });

  test('works without callbacks', () => {
    const acc = createAccumulator();
    // Should not throw
    handleNormalizedEvent({ type: 'text_delta', delta: 'test' }, acc);
    handleNormalizedEvent({ type: 'error', message: 'fail' }, acc);
    handleNormalizedEvent({ type: 'done' }, acc);
    expect(acc.content).toBe('test');
  });
});

// ============================================
// eventToChunk
// ============================================

describe('eventToChunk', () => {
  test('converts text_delta to token chunk', () => {
    const chunk = eventToChunk({ type: 'text_delta', delta: 'hello' });
    expect(chunk).toBeDefined();
    expect(chunk!.type).toBe('token');
    expect(chunk!.content).toBe('hello');
    expect(chunk!.timestamp).toBeGreaterThan(0);
  });

  test('converts reasoning_delta to reasoning chunk', () => {
    const chunk = eventToChunk({ type: 'reasoning_delta', delta: 'thinking' });
    expect(chunk).toBeDefined();
    expect(chunk!.type).toBe('reasoning');
    expect(chunk!.content).toBe('thinking');
  });

  test('converts tool_call_done to tool_call chunk', () => {
    const chunk = eventToChunk({
      type: 'tool_call_done',
      id: 'call_1',
      name: 'bash',
      arguments: '{"command":"ls"}',
    });
    expect(chunk).toBeDefined();
    expect(chunk!.type).toBe('tool_call');
    expect((chunk as any).toolCallId).toBe('call_1');
    expect((chunk as any).toolName).toBe('bash');
    expect((chunk as any).toolArguments).toBe('{"command":"ls"}');
  });

  test('converts done to status chunk', () => {
    const chunk = eventToChunk({ type: 'done' });
    expect(chunk).toBeDefined();
    expect(chunk!.type).toBe('status');
    expect(chunk!.content).toBe('completed');
  });

  test('converts error to error chunk', () => {
    const chunk = eventToChunk({ type: 'error', message: 'API failure' });
    expect(chunk).toBeDefined();
    expect(chunk!.type).toBe('error');
    expect(chunk!.content).toBe('API failure');
  });

  test('returns null for unhandled events', () => {
    expect(eventToChunk({ type: 'tool_call_start', id: 'x', name: 'y', index: 0 })).toBeNull();
    expect(eventToChunk({ type: 'tool_call_delta', id: 'x', delta: 'y', index: 0 })).toBeNull();
    expect(eventToChunk({ type: 'response_meta', responseId: 'x' })).toBeNull();
  });
});
