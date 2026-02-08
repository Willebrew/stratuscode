import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { skillTool, listSkills } from './skill';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const ctx = (projectDir: string) => ({ sessionId: 'test', metadata: { projectDir } });

describe('skill tool', () => {
  test('returns error when skill not found', async () => {
    const result = await skillTool.execute({ name: 'nonexistent' }, ctx(tmpDir) as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe(true);
    expect(parsed.message).toContain('not found');
    expect(parsed.hint).toBeTruthy();
  });

  test('loads a skill from .stratuscode/skills directory', async () => {
    const skillDir = path.join(tmpDir, '.stratuscode', 'skills');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'testing.md'),
      '---\nname: testing\ndescription: Test writing guide\n---\nAlways write tests first.'
    );

    const result = await skillTool.execute({ name: 'testing' }, ctx(tmpDir) as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.name).toBe('testing');
    expect(parsed.description).toBe('Test writing guide');
    expect(parsed.instructions).toContain('Always write tests first');
  });

  test('case-insensitive skill lookup', async () => {
    const skillDir = path.join(tmpDir, '.stratuscode', 'skills');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'Frontend.md'),
      '---\nname: frontend\ndescription: Frontend guide\n---\nUse React.'
    );

    const result = await skillTool.execute({ name: 'FRONTEND' }, ctx(tmpDir) as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.name).toBe('frontend');
  });

  test('handles skill without frontmatter', async () => {
    const skillDir = path.join(tmpDir, '.stratuscode', 'skills');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'plain.md'), 'Just plain content.');

    const result = await skillTool.execute({ name: 'plain' }, ctx(tmpDir) as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.name).toBe('plain');
    expect(parsed.instructions).toContain('Just plain content');
  });
});

describe('skill: listSkills', () => {
  test('returns empty array when no skills exist', async () => {
    const skills = await listSkills(tmpDir);
    expect(skills).toEqual([]);
  });

  test('returns discovered skills', async () => {
    const skillDir = path.join(tmpDir, '.stratuscode', 'skills');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'debug.md'),
      '---\nname: debug\ndescription: Debugging guide\n---\nStep 1.'
    );

    const skills = await listSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('debug');
    expect(skills[0]!.description).toBe('Debugging guide');
  });
});
