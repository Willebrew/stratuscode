/**
 * Stream Handler
 *
 * Processes SAGE NormalizedStreamEvents and accumulates results.
 * Provider-agnostic — works with both Responses API and Chat Completions.
 */

import type { ToolCall, StreamChunk } from '@stratuscode/shared';
import type { NormalizedStreamEvent } from '@willebrew/sage-core/providers';

// ============================================
// Types
// ============================================

export interface StreamAccumulator {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
  /** Responses API response ID for recursive calls via previous_response_id */
  responseId?: string;
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onReasoning?: (text: string) => void;
  onToolCallStart?: (toolCall: { id: string; name: string }) => void;
  onToolCallChunk?: (chunk: { id: string; name?: string; delta: string }) => void;
  onToolCallArgs?: (id: string, delta: string) => void;
  onToolCallComplete?: (toolCall: ToolCall) => void;
  onComplete?: (accumulator: StreamAccumulator) => void;
  onError?: (error: Error) => void;
}

// ============================================
// Stream Handler
// ============================================

/**
 * Handle a single SAGE NormalizedStreamEvent, updating the accumulator
 * and firing callbacks. This is the core event dispatcher.
 */
export function handleNormalizedEvent(
  event: NormalizedStreamEvent,
  accumulator: StreamAccumulator,
  callbacks?: StreamCallbacks,
): void {
  switch (event.type) {
    case 'text_delta':
      accumulator.content += event.delta;
      callbacks?.onToken?.(event.delta);
      break;

    case 'reasoning_delta':
      accumulator.reasoning += event.delta;
      callbacks?.onReasoning?.(event.delta);
      break;

    case 'tool_call_start':
      accumulator.toolCalls.push({
        id: event.id,
        type: 'function',
        function: { name: event.name, arguments: '' },
      });
      callbacks?.onToolCallStart?.({ id: event.id, name: event.name });
      break;

    case 'tool_call_delta': {
      const tc = accumulator.toolCalls.find(t => t.id === event.id);
      if (tc) {
        tc.function.arguments += event.delta;
        callbacks?.onToolCallChunk?.({ id: event.id, name: tc.function.name, delta: event.delta });
      }
      callbacks?.onToolCallArgs?.(event.id, event.delta);
      break;
    }

    case 'tool_call_done': {
      const tc = accumulator.toolCalls.find(t => t.id === event.id);
      if (tc) {
        tc.function.name = event.name;
        if (event.arguments) tc.function.arguments = event.arguments;
        callbacks?.onToolCallComplete?.(tc);
      }
      break;
    }

    case 'response_meta':
      if (event.responseId) accumulator.responseId = event.responseId;
      if (event.usage) {
        accumulator.inputTokens = event.usage.inputTokens;
        accumulator.outputTokens = event.usage.outputTokens;
      }
      break;

    case 'error':
      callbacks?.onError?.(new Error(event.message));
      break;

    case 'done':
      callbacks?.onComplete?.(accumulator);
      break;
  }
}

/**
 * Create a fresh StreamAccumulator
 */
export function createAccumulator(): StreamAccumulator {
  return {
    content: '',
    reasoning: '',
    toolCalls: [],
    inputTokens: 0,
    outputTokens: 0,
  };
}

// ============================================
// Stream Chunk Conversion
// ============================================

/**
 * Convert a NormalizedStreamEvent to a StreamChunk for storage/transmission
 */
export function eventToChunk(event: NormalizedStreamEvent): StreamChunk | null {
  const timestamp = Date.now();

  switch (event.type) {
    case 'text_delta':
      return {
        type: 'token',
        content: event.delta,
        timestamp,
      };

    case 'reasoning_delta':
      return {
        type: 'reasoning',
        content: event.delta,
        timestamp,
      };

    case 'tool_call_done':
      return {
        type: 'tool_call',
        content: '',
        timestamp,
        toolCallId: event.id,
        toolName: event.name,
        toolArguments: event.arguments,
      };

    case 'done':
      return {
        type: 'status',
        content: 'completed',
        timestamp,
        status: 'completed',
      };

    case 'error':
      return {
        type: 'error',
        content: event.message,
        timestamp,
      };

    default:
      return null;
  }
}
