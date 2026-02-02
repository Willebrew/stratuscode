/**
 * Skill Tool
 *
 * Loads specialized instructions from SKILL.md files.
 * Skills are Markdown files with YAML frontmatter that define
 * specialized knowledge for specific tasks.
 */

import { defineTool } from './sage-adapter';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface SkillArgs extends Record<string, unknown> {
  name: string;
}

interface SkillDefinition {
  name: string;
  description: string;
  content: string;
  path: string;
}

// Skill search paths
const SKILL_PATHS = [
  '.stratuscode/skills',
  '.claude/skills',
  '.opencode/skills',
];

const GLOBAL_SKILL_PATHS = [
  path.join(os.homedir(), '.stratuscode', 'skills'),
  path.join(os.homedir(), '.claude', 'skills'),
];

/**
 * Parse YAML frontmatter from Markdown content
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!frontmatterMatch || !frontmatterMatch[1] || frontmatterMatch[2] === undefined) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterText = frontmatterMatch[1];
  const body = frontmatterMatch[2];
  
  const frontmatter: Record<string, string> = {};
  const lines = frontmatterText.split('\n');
  
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match && match[1] && match[2] !== undefined) {
      frontmatter[match[1]] = match[2].trim();
    }
  }

  return { frontmatter, body };
}

/**
 * Discover all available skills
 */
async function discoverSkills(projectDir: string): Promise<SkillDefinition[]> {
  const skills: SkillDefinition[] = [];
  const searchPaths = [
    ...SKILL_PATHS.map(p => path.join(projectDir, p)),
    ...GLOBAL_SKILL_PATHS,
  ];

  for (const searchPath of searchPaths) {
    try {
      const entries = await fs.readdir(searchPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.md') && entry.name !== 'SKILL.md') continue;
        
        const filePath = path.join(searchPath, entry.name);
        const content = await fs.readFile(filePath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(content);
        
        // Get skill name from frontmatter or filename
        const name = frontmatter['name'] || entry.name.replace(/\.md$/, '').replace(/^SKILL-?/, '');
        const description = frontmatter['description'] || `Skill: ${name}`;
        
        skills.push({
          name: name.toLowerCase(),
          description,
          content: body,
          path: filePath,
        });
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return skills;
}

/**
 * Find a skill by name
 */
async function findSkill(projectDir: string, name: string): Promise<SkillDefinition | null> {
  const skills = await discoverSkills(projectDir);
  const normalizedName = name.toLowerCase();
  
  return skills.find(s => s.name === normalizedName) || null;
}

export const skillTool = defineTool<SkillArgs>({
  name: 'skill',
  description: `Load specialized instructions for a specific task.

Skills are Markdown files that contain expert knowledge for particular tasks like:
- frontend: Frontend development best practices
- testing: Test writing strategies
- refactoring: Code refactoring guidelines
- debugging: Debugging methodologies
- documentation: Documentation standards

Use this tool when you need specialized guidance for a particular type of task.`,
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The name of the skill to load (e.g., "frontend", "testing")',
      },
    },
    required: ['name'],
  },

  async execute(args, context) {
    const { name } = args;
    
    const skill = await findSkill(context.projectDir, name);
    
    if (!skill) {
      // List available skills
      const skills = await discoverSkills(context.projectDir);
      const available = skills.map(s => s.name).join(', ') || 'none';
      
      return JSON.stringify({
        error: true,
        message: `Skill "${name}" not found.`,
        availableSkills: available,
        hint: `Create a skill file at .stratuscode/skills/${name}.md with YAML frontmatter (name, description) and Markdown content.`,
      });
    }

    return JSON.stringify({
      name: skill.name,
      description: skill.description,
      instructions: skill.content,
      source: skill.path,
    });
  },
});

/**
 * List all available skills
 */
export async function listSkills(projectDir: string): Promise<{ name: string; description: string }[]> {
  const skills = await discoverSkills(projectDir);
  return skills.map(s => ({ name: s.name, description: s.description }));
}
