/**
 * Theme Tests
 */

import { describe, test, expect } from 'bun:test';
import { colors, getColor, getStatusColor, getPriorityColor } from './colors';
import { icons, getIcon, getStatusIcon, getPriorityIcon, box } from './icons';

describe('Colors', () => {
  test('colors object has expected keys', () => {
    expect(colors.primary).toBeDefined();
    expect(colors.success).toBeDefined();
    expect(colors.error).toBeDefined();
    expect(colors.text).toBeDefined();
  });

  test('getColor returns color value', () => {
    expect(getColor('primary')).toBe('#7C3AED');
    expect(getColor('success')).toBe('#10B981');
  });

  test('getStatusColor returns correct colors', () => {
    expect(getStatusColor('pending')).toBe(colors.pending);
    expect(getStatusColor('in_progress')).toBe(colors.inProgress);
    expect(getStatusColor('completed')).toBe(colors.completed);
  });

  test('getPriorityColor returns correct colors', () => {
    expect(getPriorityColor('low')).toBe(colors.textDim);
    expect(getPriorityColor('high')).toBe(colors.warning);
  });
});

describe('Icons', () => {
  test('icons object has expected keys', () => {
    expect(icons.pending).toBeDefined();
    expect(icons.completed).toBeDefined();
    expect(icons.check).toBeDefined();
  });

  test('getStatusIcon returns correct icons', () => {
    expect(getStatusIcon('pending')).toBe('○');
    expect(getStatusIcon('completed')).toBe('●');
    expect(getStatusIcon('in_progress')).toBe('◐');
  });

  test('getPriorityIcon returns correct icons', () => {
    expect(getPriorityIcon('high')).toBe('!!');
    expect(getPriorityIcon('medium')).toBe('!');
    expect(getPriorityIcon('low')).toBe('~');
  });

  test('box creates ASCII box around content', () => {
    const result = box('Hello');
    expect(result).toContain('┌');
    expect(result).toContain('┘');
    expect(result).toContain('Hello');
  });
});
