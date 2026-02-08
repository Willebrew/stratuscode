/**
 * Todo Markdown Tests
 *
 * Tests for formatTodosAsMarkdown and parseTodosFromMarkdown -
 * round-trip serialization/deserialization of todo items.
 */

import { describe, test, expect } from 'bun:test';
import { formatTodosAsMarkdown, parseTodosFromMarkdown } from './todo';
import type { TodoInfo } from './todo';

// ============================================
// formatTodosAsMarkdown
// ============================================

describe('formatTodosAsMarkdown', () => {
  test('formats empty list', () => {
    const result = formatTodosAsMarkdown([]);
    expect(result).toContain('# Plan');
    expect(result).toContain('_No tasks defined yet._');
  });

  test('formats pending todo', () => {
    const todos: TodoInfo[] = [{
      id: '1',
      content: 'Implement feature',
      status: 'pending',
    }];
    const result = formatTodosAsMarkdown(todos);
    expect(result).toContain('- [ ] Implement feature');
  });

  test('formats completed todo', () => {
    const todos: TodoInfo[] = [{
      id: '1',
      content: 'Fix bug',
      status: 'completed',
    }];
    const result = formatTodosAsMarkdown(todos);
    expect(result).toContain('- [x] Fix bug');
  });

  test('formats in_progress todo with badge', () => {
    const todos: TodoInfo[] = [{
      id: '1',
      content: 'Working on it',
      status: 'in_progress',
    }];
    const result = formatTodosAsMarkdown(todos);
    expect(result).toContain('- [ ] Working on it [IN PROGRESS]');
  });

  test('formats high priority todo', () => {
    const todos: TodoInfo[] = [{
      id: '1',
      content: 'Critical task',
      status: 'pending',
      priority: 'high',
    }];
    const result = formatTodosAsMarkdown(todos);
    expect(result).toContain('[HIGH]');
  });

  test('formats low priority todo', () => {
    const todos: TodoInfo[] = [{
      id: '1',
      content: 'Nice to have',
      status: 'pending',
      priority: 'low',
    }];
    const result = formatTodosAsMarkdown(todos);
    expect(result).toContain('[LOW]');
  });

  test('medium priority has no badge', () => {
    const todos: TodoInfo[] = [{
      id: '1',
      content: 'Normal task',
      status: 'pending',
      priority: 'medium',
    }];
    const result = formatTodosAsMarkdown(todos);
    expect(result).not.toContain('[MEDIUM]');
    expect(result).not.toContain('[HIGH]');
    expect(result).not.toContain('[LOW]');
  });

  test('formats multiple todos', () => {
    const todos: TodoInfo[] = [
      { id: '1', content: 'Task 1', status: 'completed' },
      { id: '2', content: 'Task 2', status: 'in_progress' },
      { id: '3', content: 'Task 3', status: 'pending', priority: 'high' },
    ];
    const result = formatTodosAsMarkdown(todos);
    expect(result).toContain('- [x] Task 1');
    expect(result).toContain('- [ ] Task 2 [IN PROGRESS]');
    expect(result).toContain('- [ ] Task 3 [HIGH]');
  });

  test('includes section headers', () => {
    const result = formatTodosAsMarkdown([]);
    expect(result).toContain('# Plan');
    expect(result).toContain('## Tasks');
  });
});

// ============================================
// parseTodosFromMarkdown
// ============================================

describe('parseTodosFromMarkdown', () => {
  test('parses pending item', () => {
    const result = parseTodosFromMarkdown('- [ ] Task one');
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Task one');
    expect(result[0].status).toBe('pending');
  });

  test('parses completed item', () => {
    const result = parseTodosFromMarkdown('- [x] Done task');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('completed');
  });

  test('parses uppercase X as completed', () => {
    const result = parseTodosFromMarkdown('- [X] Done task');
    expect(result[0].status).toBe('completed');
  });

  test('parses in_progress badge', () => {
    const result = parseTodosFromMarkdown('- [ ] Working on it [IN PROGRESS]');
    expect(result[0].status).toBe('in_progress');
    expect(result[0].content).toBe('Working on it');
  });

  test('parses high priority badge', () => {
    const result = parseTodosFromMarkdown('- [ ] Critical [HIGH]');
    expect(result[0].priority).toBe('high');
    expect(result[0].content).toBe('Critical');
  });

  test('parses low priority badge', () => {
    const result = parseTodosFromMarkdown('- [ ] Nice to have [LOW]');
    expect(result[0].priority).toBe('low');
    expect(result[0].content).toBe('Nice to have');
  });

  test('defaults to medium priority', () => {
    const result = parseTodosFromMarkdown('- [ ] Normal task');
    expect(result[0].priority).toBe('medium');
  });

  test('parses multiple items', () => {
    const markdown = `# Plan
## Tasks

- [x] First task
- [ ] Second task [IN PROGRESS]
- [ ] Third task [HIGH]`;

    const result = parseTodosFromMarkdown(markdown);
    expect(result).toHaveLength(3);
    expect(result[0].status).toBe('completed');
    expect(result[1].status).toBe('in_progress');
    expect(result[2].priority).toBe('high');
  });

  test('ignores non-todo lines', () => {
    const markdown = `# Plan
Some description text
Not a todo item

- [ ] Actual todo`;

    const result = parseTodosFromMarkdown(markdown);
    expect(result).toHaveLength(1);
  });

  test('returns empty for content with no todos', () => {
    expect(parseTodosFromMarkdown('Just plain text')).toEqual([]);
    expect(parseTodosFromMarkdown('')).toEqual([]);
  });

  test('round-trips through format and parse', () => {
    const original: TodoInfo[] = [
      { id: '1', content: 'Task A', status: 'completed' },
      { id: '2', content: 'Task B', status: 'in_progress' },
      { id: '3', content: 'Task C', status: 'pending', priority: 'high' },
      { id: '4', content: 'Task D', status: 'pending', priority: 'low' },
    ];

    const markdown = formatTodosAsMarkdown(original);
    const parsed = parseTodosFromMarkdown(markdown);

    expect(parsed).toHaveLength(4);
    expect(parsed[0].content).toBe('Task A');
    expect(parsed[0].status).toBe('completed');
    expect(parsed[1].content).toBe('Task B');
    expect(parsed[1].status).toBe('in_progress');
    expect(parsed[2].content).toBe('Task C');
    expect(parsed[2].priority).toBe('high');
    expect(parsed[3].content).toBe('Task D');
    expect(parsed[3].priority).toBe('low');
  });
});
