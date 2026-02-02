/**
 * Permission Rule Matching
 *
 * Glob-style pattern matching for permission rules.
 */

/**
 * Match a pattern against a path
 * Supports:
 * - * matches any single path segment
 * - ** matches any number of path segments
 * - Literal strings match exactly
 */
export function matchPattern(pattern: string, path: string): boolean {
  // Handle exact match
  if (pattern === path) {
    return true;
  }

  // Handle wildcard
  if (pattern === '*' || pattern === '**') {
    return true;
  }

  // Convert glob pattern to regex
  const regexPattern = globToRegex(pattern);
  return regexPattern.test(path);
}

/**
 * Convert a glob pattern to a regular expression
 */
function globToRegex(pattern: string): RegExp {
  let regex = '';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];
    
    if (char === '*') {
      // Check for **
      if (pattern[i + 1] === '*') {
        // ** matches anything including path separators
        regex += '.*';
        i += 2;
        // Skip trailing slash if present
        if (pattern[i] === '/') {
          i++;
        }
      } else {
        // * matches anything except path separators
        regex += '[^/]*';
        i++;
      }
    } else if (char === '?') {
      // ? matches any single character except path separator
      regex += '[^/]';
      i++;
    } else if (char === '[') {
      // Character class - find the closing bracket
      const closeIndex = pattern.indexOf(']', i);
      if (closeIndex === -1) {
        regex += '\\[';
        i++;
      } else {
        regex += pattern.slice(i, closeIndex + 1);
        i = closeIndex + 1;
      }
    } else if ('.+^${}|()\\'.includes(char!)) {
      // Escape regex special characters
      regex += '\\' + char;
      i++;
    } else {
      regex += char;
      i++;
    }
  }

  return new RegExp(`^${regex}$`);
}

/**
 * Check if a path is within a directory
 */
export function isWithinDirectory(path: string, directory: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedDir = normalizePath(directory);

  return normalizedPath.startsWith(normalizedDir + '/') || normalizedPath === normalizedDir;
}

/**
 * Normalize a file path
 */
function normalizePath(path: string): string {
  // Remove trailing slash
  return path.replace(/\/+$/, '');
}

/**
 * Check if a command is potentially dangerous
 */
export function isDangerousCommand(command: string): boolean {
  const dangerousPatterns = [
    /\brm\s+-rf?\s/i,
    /\bsudo\b/i,
    /\bchmod\s+777\b/i,
    /\bdd\s+if=/i,
    /\bmkfs\b/i,
    /\b>\s*\/dev\/sd/i,
    /\bcurl\b.*\|\s*(ba)?sh/i,
    /\bwget\b.*\|\s*(ba)?sh/i,
    /\beval\b/i,
    /\bexec\b/i,
  ];

  return dangerousPatterns.some(pattern => pattern.test(command));
}

/**
 * Extract the base command from a command string
 */
export function extractBaseCommand(command: string): string {
  // Remove leading environment variables
  const withoutEnv = command.replace(/^(\w+=\S+\s+)*/, '');
  
  // Get the first word
  const match = withoutEnv.match(/^(\S+)/);
  return match?.[1] ?? command;
}
