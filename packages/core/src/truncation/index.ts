/**
 * Truncation Module
 *
 * Smart output truncation for tool results to prevent context overflow.
 * Saves full output to disk and provides truncated preview.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ============================================
// Constants
// ============================================

export const MAX_LINES = 2000;
export const MAX_BYTES = 50 * 1024; // 50KB
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ============================================
// Types
// ============================================

export type TruncateResult =
  | { content: string; truncated: false }
  | { content: string; truncated: true; outputPath: string; removedCount: number; unit: 'lines' | 'bytes' };

export interface TruncateOptions {
  maxLines?: number;
  maxBytes?: number;
  direction?: 'head' | 'tail';
}

// ============================================
// Truncation Functions
// ============================================

export namespace Truncate {
  let outputDir: string | null = null;

  /**
   * Initialize the truncation module with output directory
   */
  export async function init(baseDir?: string): Promise<void> {
    outputDir = baseDir ?? path.join(os.homedir(), '.stratuscode', 'tool-output');
    await fs.mkdir(outputDir, { recursive: true });
  }

  /**
   * Get the output directory
   */
  export function getOutputDir(): string {
    if (!outputDir) {
      outputDir = path.join(os.homedir(), '.stratuscode', 'tool-output');
    }
    return outputDir;
  }

  /**
   * Truncate output if it exceeds limits
   */
  export async function output(
    text: string,
    options: TruncateOptions = {}
  ): Promise<TruncateResult> {
    const maxLines = options.maxLines ?? MAX_LINES;
    const maxBytes = options.maxBytes ?? MAX_BYTES;
    const direction = options.direction ?? 'head';

    const lines = text.split('\n');
    const totalBytes = Buffer.byteLength(text, 'utf-8');

    // Check if truncation is needed
    if (lines.length <= maxLines && totalBytes <= maxBytes) {
      return { content: text, truncated: false };
    }

    // Truncate
    const out: string[] = [];
    let bytes = 0;
    let hitBytes = false;

    if (direction === 'head') {
      for (let i = 0; i < lines.length && i < maxLines; i++) {
        const line = lines[i] ?? '';
        const lineBytes = Buffer.byteLength(line, 'utf-8') + (i > 0 ? 1 : 0);
        if (bytes + lineBytes > maxBytes) {
          hitBytes = true;
          break;
        }
        out.push(line);
        bytes += lineBytes;
      }
    } else {
      for (let i = lines.length - 1; i >= 0 && out.length < maxLines; i--) {
        const line = lines[i] ?? '';
        const lineBytes = Buffer.byteLength(line, 'utf-8') + (out.length > 0 ? 1 : 0);
        if (bytes + lineBytes > maxBytes) {
          hitBytes = true;
          break;
        }
        out.unshift(line);
        bytes += lineBytes;
      }
    }

    // Calculate what was removed
    const removed = hitBytes ? totalBytes - bytes : lines.length - out.length;
    const unit = hitBytes ? 'bytes' : 'lines';
    const preview = out.join('\n');

    // Save full output to file
    const dir = getOutputDir();
    await fs.mkdir(dir, { recursive: true });
    
    const filename = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const filepath = path.join(dir, filename);
    await fs.writeFile(filepath, text, 'utf-8');

    // Build truncation message
    const hint = `The output was truncated. Full output saved to: ${filepath}\nUse Grep to search the full content or Read with offset/limit to view specific sections.`;
    
    const message = direction === 'head'
      ? `${preview}\n\n...${removed} ${unit} truncated...\n\n${hint}`
      : `...${removed} ${unit} truncated...\n\n${hint}\n\n${preview}`;

    return {
      content: message,
      truncated: true,
      outputPath: filepath,
      removedCount: removed,
      unit,
    };
  }

  /**
   * Clean up old truncation files
   */
  export async function cleanup(retentionMs: number = RETENTION_MS): Promise<number> {
    const dir = getOutputDir();
    const cutoff = Date.now() - retentionMs;
    let cleaned = 0;

    try {
      const entries = await fs.readdir(dir);
      
      for (const entry of entries) {
        if (!entry.startsWith('tool_')) continue;
        
        // Extract timestamp from filename
        const match = entry.match(/^tool_(\d+)_/);
        if (!match || !match[1]) continue;
        
        const timestamp = parseInt(match[1], 10);
        if (timestamp < cutoff) {
          await fs.unlink(path.join(dir, entry)).catch(() => {});
          cleaned++;
        }
      }
    } catch {
      // Ignore cleanup errors
    }

    return cleaned;
  }

  /**
   * Check if text needs truncation
   */
  export function needsTruncation(text: string, options: TruncateOptions = {}): boolean {
    const maxLines = options.maxLines ?? MAX_LINES;
    const maxBytes = options.maxBytes ?? MAX_BYTES;
    
    const lineCount = text.split('\n').length;
    const byteCount = Buffer.byteLength(text, 'utf-8');
    
    return lineCount > maxLines || byteCount > maxBytes;
  }

  /**
   * Format a truncation summary
   */
  export function formatSummary(result: TruncateResult): string {
    if (!result.truncated) {
      return 'Output not truncated';
    }
    return `Output truncated: ${result.removedCount} ${result.unit} removed. Full output saved to ${result.outputPath}`;
  }
}

export default Truncate;
