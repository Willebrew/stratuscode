/**
 * Base error class for StratusCode
 */
export class StratusCodeError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'StratusCodeError';
  }
}

/**
 * Configuration error
 */
export class ConfigError extends StratusCodeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', details);
    this.name = 'ConfigError';
  }
}

/**
 * Provider/API error
 */
export class ProviderError extends StratusCodeError {
  constructor(
    message: string,
    public statusCode?: number,
    details?: Record<string, unknown>
  ) {
    super(message, 'PROVIDER_ERROR', details);
    this.name = 'ProviderError';
  }

  static isRetryable(error: Error): boolean {
    if (error instanceof ProviderError) {
      const status = error.statusCode;
      // Retry on rate limits and server errors
      return status === 429 || (status !== undefined && status >= 500);
    }
    return false;
  }
}

/**
 * Tool execution error
 */
export class ToolError extends StratusCodeError {
  constructor(
    message: string,
    public toolName: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'TOOL_ERROR', { toolName, ...details });
    this.name = 'ToolError';
  }
}

/**
 * Permission denied error
 */
export class PermissionError extends StratusCodeError {
  constructor(
    message: string,
    public permission: string,
    public pattern?: string
  ) {
    super(message, 'PERMISSION_DENIED', { permission, pattern });
    this.name = 'PermissionError';
  }
}

/**
 * Session error
 */
export class SessionError extends StratusCodeError {
  constructor(
    message: string,
    public sessionId?: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'SESSION_ERROR', { sessionId, ...details });
    this.name = 'SessionError';
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends StratusCodeError {
  constructor(message: string, public timeoutMs: number) {
    super(message, 'TIMEOUT', { timeoutMs });
    this.name = 'TimeoutError';
  }
}

/**
 * Max depth exceeded error
 */
export class MaxDepthError extends StratusCodeError {
  constructor(public depth: number, public maxDepth: number) {
    super(
      `Tool loop exceeded max depth of ${maxDepth}`,
      'MAX_DEPTH_EXCEEDED',
      { depth, maxDepth }
    );
    this.name = 'MaxDepthError';
  }
}

/**
 * Abort error (user cancelled)
 */
export class AbortError extends StratusCodeError {
  constructor(message = 'Operation was aborted') {
    super(message, 'ABORTED');
    this.name = 'AbortError';
  }
}

/**
 * Validation error for tool arguments
 */
export class ValidationError extends StratusCodeError {
  constructor(
    message: string,
    public errors: Array<{ path: string; message: string }>
  ) {
    super(message, 'VALIDATION_ERROR', { errors });
    this.name = 'ValidationError';
  }
}

/**
 * Format error for display
 */
export function formatError(error: Error): string {
  if (error instanceof StratusCodeError) {
    let msg = `${error.name}: ${error.message}`;
    if (error.details) {
      msg += `\nDetails: ${JSON.stringify(error.details, null, 2)}`;
    }
    return msg;
  }
  return error.message;
}

/**
 * Format tool error for LLM consumption
 */
export function formatToolError(
  error: Error,
  toolName: string,
  args?: Record<string, unknown>
): string {
  const errorObj = {
    error: true,
    message: error.message,
    toolName,
    suggestion: getSuggestion(error, toolName),
    ...(args && { providedArgs: args }),
  };
  return JSON.stringify(errorObj, null, 2);
}

function getSuggestion(error: Error, toolName: string): string {
  if (error instanceof PermissionError) {
    return 'This operation requires user permission. Consider asking the user or using an alternative approach.';
  }
  if (error instanceof TimeoutError) {
    return `The ${toolName} tool timed out. Try with smaller input or break the task into smaller parts.`;
  }
  if (error instanceof ValidationError) {
    return 'Check the tool parameters and ensure they match the expected schema.';
  }
  if (error.message.includes('ENOENT')) {
    return 'File or directory not found. Verify the path exists.';
  }
  if (error.message.includes('EACCES')) {
    return 'Permission denied. The file may be read-only or in a protected location.';
  }
  return 'Review the error message and adjust your approach.';
}
