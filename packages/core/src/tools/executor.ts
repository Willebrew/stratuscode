/**
 * Tool Executor
 *
 * Handles tool execution with validation, timeout, and result formatting.
 */

import type { Tool, ToolContext, JSONSchema } from '@stratuscode/shared';
import {
  ToolError,
  TimeoutError,
  ValidationError,
  truncateResult,
  formatToolError,
} from '@stratuscode/shared';
import { withRetry, shouldRetryError } from './retry';

// ============================================
// Constants
// ============================================

export const DEFAULT_TOOL_TIMEOUT = 60000; // 60 seconds
export const DEFAULT_MAX_RESULT_SIZE = 100000; // 100KB

// ============================================
// Validation
// ============================================

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

/**
 * Validate tool arguments against schema
 */
export function validateToolArgs(
  tool: Tool,
  args: Record<string, unknown>
): ValidationResult {
  const errors: Array<{ path: string; message: string }> = [];
  const schema = tool.parameters;

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (args[field] === undefined) {
        errors.push({
          path: field,
          message: `Required field "${field}" is missing`,
        });
      }
    }
  }

  // Basic type validation for properties
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const value = args[key];
      if (value === undefined) continue;

      const prop = propSchema as JSONSchema;
      if (prop.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        const expectedType = prop.type;

        if (expectedType === 'integer' && actualType === 'number') {
          if (!Number.isInteger(value)) {
            errors.push({
              path: key,
              message: `Expected integer but got float`,
            });
          }
        } else if (expectedType !== actualType && expectedType !== 'any') {
          errors.push({
            path: key,
            message: `Expected ${expectedType} but got ${actualType}`,
          });
        }
      }

      // Enum validation
      if (prop.enum && !prop.enum.includes(value)) {
        errors.push({
          path: key,
          message: `Value must be one of: ${prop.enum.join(', ')}`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format validation errors for LLM
 */
export function formatValidationError(
  errors: Array<{ path: string; message: string }>,
  toolName: string
): string {
  const errorObj = {
    error: true,
    type: 'validation_error',
    toolName,
    errors,
    suggestion: 'Check the tool parameters and ensure they match the expected schema.',
  };
  return JSON.stringify(errorObj, null, 2);
}

// ============================================
// Execution
// ============================================

/**
 * Execute a function with timeout
 */
export async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeout: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(message, timeout));
    }, timeout);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Execute a tool with full error handling
 */
export async function executeTool(
  tool: Tool,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<{ success: boolean; result: string }> {
  // Validate arguments
  const validation = validateToolArgs(tool, args);
  if (!validation.valid) {
    return {
      success: false,
      result: formatValidationError(validation.errors, tool.name),
    };
  }

  // Determine timeout and max result size
  const timeout = tool.timeout ?? DEFAULT_TOOL_TIMEOUT;
  const maxResultSize = tool.maxResultSize ?? DEFAULT_MAX_RESULT_SIZE;

  // Use retry for transient errors
  const retryResult = await withRetry(
    async () => {
      // Execute with timeout
      const result = await executeWithTimeout(
        () => tool.execute(args, context),
        timeout,
        `Tool "${tool.name}" timed out after ${timeout}ms`
      );

      // Stringify and truncate result
      let resultStr = typeof result === 'string' ? result : JSON.stringify(result);
      if (resultStr.length > maxResultSize) {
        resultStr = truncateResult(resultStr, maxResultSize);
      }

      return resultStr;
    },
    { maxRetries: 2 }
  );

  if (retryResult.success) {
    return { success: true, result: retryResult.result! };
  }

  return {
    success: false,
    result: formatToolError(
      retryResult.error || new Error('Unknown error'),
      tool.name,
      args
    ),
  };
}

// ============================================
// Result Formatting
// ============================================

/**
 * Format tool result for display
 */
export function formatToolResult(
  toolName: string,
  result: string,
  success: boolean
): string {
  if (success) {
    return result;
  }
  
  // Error results are already formatted as JSON
  return result;
}

/**
 * Parse tool arguments from JSON string
 */
export function parseToolArguments(argsString: string): Record<string, unknown> {
  try {
    return JSON.parse(argsString || '{}');
  } catch {
    throw new ToolError(
      `Failed to parse tool arguments: ${argsString}`,
      'parse_error'
    );
  }
}
