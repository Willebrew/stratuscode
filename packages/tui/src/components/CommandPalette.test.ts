import { describe, expect, test } from 'bun:test';
import { getCommandWindow, getCommandResultCount } from './CommandPalette';
import { commands } from '../commands/registry';

describe('CommandPalette windowing', () => {
  test('clamps offset to available commands', () => {
    const total = getCommandResultCount('');
    const window = getCommandWindow('', 999, 5);
    expect(window.length).toBe(Math.min(5, total));
  });

  test('returns commands starting at offset', () => {
    const window = getCommandWindow('', 1, 3);
    if (commands.length > 1) {
      expect(window[0]).toEqual(commands[1]);
    }
  });
});

