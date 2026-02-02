/**
 * Todo Storage Tests
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initDatabase, closeDatabase } from './database';
import { createTodo, listTodos, updateTodo, deleteTodo, replaceTodos, getTodosCount } from './todos';

describe('Todo Storage', () => {
  const testSessionId = 'test-session-123';

  beforeAll(() => {
    initDatabase({ dataDir: '/tmp/stratuscode-test' });
  });

  afterAll(() => {
    closeDatabase();
  });

  test('createTodo creates a todo', () => {
    const todo = createTodo(testSessionId, 'Test task 1');
    
    expect(todo).toBeDefined();
    expect(todo.id).toMatch(/^todo_/);
    expect(todo.content).toBe('Test task 1');
    expect(todo.status).toBe('pending');
    expect(todo.priority).toBe('medium');
  });

  test('listTodos returns todos for session', () => {
    const todos = listTodos(testSessionId);
    
    expect(Array.isArray(todos)).toBe(true);
    expect(todos.length).toBeGreaterThan(0);
  });

  test('updateTodo updates status', () => {
    const todo = createTodo(testSessionId, 'Task to update');
    const updated = updateTodo(todo.id, { status: 'in_progress' });
    
    expect(updated).toBeDefined();
    expect(updated?.status).toBe('in_progress');
  });

  test('deleteTodo removes todo', () => {
    const todo = createTodo(testSessionId, 'Task to delete');
    deleteTodo(todo.id);
    
    const todos = listTodos(testSessionId);
    const found = todos.find(t => t.id === todo.id);
    expect(found).toBeUndefined();
  });

  test('replaceTodos replaces all todos', () => {
    const newTodos = [
      { content: 'New task 1', status: 'pending' as const },
      { content: 'New task 2', status: 'in_progress' as const },
    ];
    
    const result = replaceTodos(testSessionId, newTodos);
    
    expect(result.length).toBe(2);
    expect(result[0]?.content).toBe('New task 1');
    expect(result[1]?.status).toBe('in_progress');
  });

  test('getTodosCount returns correct counts', () => {
    // Replace with known state
    replaceTodos(testSessionId, [
      { content: 'Pending', status: 'pending' as const },
      { content: 'In Progress', status: 'in_progress' as const },
      { content: 'Done', status: 'completed' as const },
    ]);

    const counts = getTodosCount(testSessionId);
    
    expect(counts.total).toBe(3);
    expect(counts.pending).toBe(1);
    expect(counts.inProgress).toBe(1);
    expect(counts.completed).toBe(1);
  });
});
