/**
 * FileMentionPalette Component
 *
 * Inline dropdown for @ file mentions. Shows matching files as user types.
 * Uses synchronous glob matching for fast autocomplete.
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import { colors } from '../theme/colors';

// ============================================
// File Search
// ============================================

interface FileResult {
  relativePath: string;
  isDirectory: boolean;
}

const DEFAULT_EXCLUDES = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.cache',
  '.turbo', '.output', '.nuxt', 'coverage', '__pycache__',
  '.stratuscode', '.vscode', '.idea',
]);

/**
 * Recursively find files matching a query string (case-insensitive substring match).
 * Fast and synchronous — designed for autocomplete speed.
 */
function findFiles(projectDir: string, query: string, maxResults = 15): FileResult[] {
  const results: FileResult[] = [];
  const lowerQuery = query.toLowerCase();

  function walk(dir: string, depth: number) {
    if (depth > 6 || results.length >= maxResults) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      if (DEFAULT_EXCLUDES.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(projectDir, fullPath);

      if (relativePath.toLowerCase().includes(lowerQuery)) {
        results.push({
          relativePath,
          isDirectory: entry.isDirectory(),
        });
      }

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      }
    }
  }

  walk(projectDir, 0);

  // Sort: shorter paths first (more relevant), then alphabetical
  results.sort((a, b) => {
    const aDepth = a.relativePath.split(path.sep).length;
    const bDepth = b.relativePath.split(path.sep).length;
    if (aDepth !== bDepth) return aDepth - bDepth;
    return a.relativePath.localeCompare(b.relativePath);
  });

  return results;
}

// ============================================
// Component
// ============================================

export interface FileMentionPaletteProps {
  query: string;
  selectedIndex: number;
  projectDir: string;
  maxVisible?: number;
}

export function FileMentionPalette({
  query,
  selectedIndex,
  projectDir,
  maxVisible = 10,
}: FileMentionPaletteProps) {
  const results = useMemo(
    () => findFiles(projectDir, query, maxVisible + 5),
    [projectDir, query, maxVisible]
  );

  const visibleResults = results.slice(0, maxVisible);

  if (visibleResults.length === 0) {
    return (
      <Box paddingX={1} paddingY={0}>
        <Text color={colors.textMuted}>No files found matching "{query}"</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <Text color={colors.textDim}>Files matching: {query}</Text>
      </Box>
      {visibleResults.map((file, index) => {
        const isSelected = index === selectedIndex;
        const icon = file.isDirectory ? '/' : ' ';
        const name = path.basename(file.relativePath);
        const dir = path.dirname(file.relativePath);
        const showDir = dir !== '.';

        return (
          <Box key={file.relativePath} paddingX={1}>
            <Text color={isSelected ? colors.primary : colors.textDim}>
              {isSelected ? '› ' : '  '}
            </Text>
            <Text color={isSelected ? colors.primary : colors.text}>
              {name}{icon === '/' ? '/' : ''}
            </Text>
            {showDir && (
              <Text color={colors.textDim}> {dir}/</Text>
            )}
          </Box>
        );
      })}
      <Box paddingX={1}>
        <Text color={colors.textDim}>↑↓ navigate  Tab select  Esc close</Text>
        <Text color={colors.textMuted}>
          {' '}{Math.min(selectedIndex + 1, visibleResults.length)}/{results.length}
        </Text>
      </Box>
    </Box>
  );
}

/** Get the number of visible results for a query */
export function getFileResultCount(projectDir: string, query: string, maxVisible = 10): number {
  return Math.min(findFiles(projectDir, query, maxVisible + 5).length, maxVisible);
}

/** Get the file path at a specific index */
export function getFileAtIndex(projectDir: string, query: string, index: number, maxVisible = 10): string | null {
  const results = findFiles(projectDir, query, maxVisible + 5).slice(0, maxVisible);
  if (index >= 0 && index < results.length) {
    return results[index]!.relativePath;
  }
  return null;
}
