/**
 * LSP Server Registry
 *
 * Auto-detection and spawning of language servers for various languages.
 * Inspired by OpenCode's comprehensive LSP support.
 */

import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

// ============================================
// Types
// ============================================

export interface LSPServerHandle {
  process: ChildProcess;
  initialization?: Record<string, unknown>;
}

export type RootFunction = (file: string, projectDir: string) => Promise<string | undefined>;

export interface LSPServerInfo {
  id: string;
  extensions: string[];
  root: RootFunction;
  spawn: (root: string) => Promise<LSPServerHandle | undefined>;
}

// ============================================
// Helpers
// ============================================

const pathExists = async (p: string): Promise<boolean> => {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
};

const which = (cmd: string): string | null => {
  const paths = (process.env.PATH || '').split(path.delimiter);
  const ext = process.platform === 'win32' ? '.exe' : '';
  const fsSync = require('fs');
  
  for (const p of paths) {
    const full = path.join(p, cmd + ext);
    try {
      fsSync.accessSync(full);
      return full;
    } catch {
      continue;
    }
  }
  return null;
};

const findUp = async (patterns: string[], start: string, stop: string): Promise<string | undefined> => {
  let current = start;
  while (current !== stop && current !== path.dirname(current)) {
    for (const pattern of patterns) {
      const candidate = path.join(current, pattern);
      if (await pathExists(candidate)) {
        return current;
      }
    }
    current = path.dirname(current);
  }
  return undefined;
};

const NearestRoot = (includePatterns: string[]): RootFunction => {
  return async (file, projectDir) => {
    const result = await findUp(includePatterns, path.dirname(file), projectDir);
    return result ?? projectDir;
  };
};

// ============================================
// Global Paths
// ============================================

const STRATUSCODE_DIR = path.join(os.homedir(), '.stratuscode');
const BIN_DIR = path.join(STRATUSCODE_DIR, 'bin');

// ============================================
// Language Server Definitions
// ============================================

export const TypeScript: LSPServerInfo = {
  id: 'typescript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'],
  root: NearestRoot(['package-lock.json', 'bun.lockb', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock', 'package.json']),
  async spawn(root) {
    const bin = which('typescript-language-server');
    if (!bin) {
      console.log('[LSP] typescript-language-server not found');
      return undefined;
    }
    return {
      process: spawn(bin, ['--stdio'], { cwd: root }),
    };
  },
};

export const Deno: LSPServerInfo = {
  id: 'deno',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
  root: async (file, projectDir) => {
    const result = await findUp(['deno.json', 'deno.jsonc'], path.dirname(file), projectDir);
    return result;
  },
  async spawn(root) {
    const bin = which('deno');
    if (!bin) return undefined;
    return {
      process: spawn(bin, ['lsp'], { cwd: root }),
    };
  },
};

export const Python: LSPServerInfo = {
  id: 'python',
  extensions: ['.py', '.pyi'],
  root: NearestRoot(['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile', 'pyrightconfig.json']),
  async spawn(root) {
    let bin = which('pyright-langserver');
    const args: string[] = [];
    
    if (!bin) {
      // Try to find in global bin
      const globalBin = path.join(BIN_DIR, 'node_modules', 'pyright', 'dist', 'pyright-langserver.js');
      if (await pathExists(globalBin)) {
        bin = 'bun';
        args.push('run', globalBin);
      } else {
        console.log('[LSP] pyright not found');
        return undefined;
      }
    }
    
    args.push('--stdio');
    
    // Detect venv
    const initialization: Record<string, string> = {};
    const venvPaths = [
      process.env.VIRTUAL_ENV,
      path.join(root, '.venv'),
      path.join(root, 'venv'),
    ].filter((p): p is string => p !== undefined);
    
    for (const venvPath of venvPaths) {
      const pythonPath = process.platform === 'win32'
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python');
      if (await pathExists(pythonPath)) {
        initialization.pythonPath = pythonPath;
        break;
      }
    }
    
    return {
      process: spawn(bin, args, { cwd: root }),
      initialization,
    };
  },
};

export const Go: LSPServerInfo = {
  id: 'go',
  extensions: ['.go'],
  root: async (file, projectDir) => {
    // Check for go.work first
    const workRoot = await findUp(['go.work'], path.dirname(file), projectDir);
    if (workRoot) return workRoot;
    return findUp(['go.mod', 'go.sum'], path.dirname(file), projectDir);
  },
  async spawn(root) {
    let bin = which('gopls');
    if (!bin) {
      const globalBin = path.join(BIN_DIR, 'gopls');
      if (await pathExists(globalBin)) {
        bin = globalBin;
      } else {
        console.log('[LSP] gopls not found');
        return undefined;
      }
    }
    return {
      process: spawn(bin, [], { cwd: root }),
    };
  },
};

export const Rust: LSPServerInfo = {
  id: 'rust',
  extensions: ['.rs'],
  root: async (file, projectDir) => {
    const crateRoot = await findUp(['Cargo.toml', 'Cargo.lock'], path.dirname(file), projectDir);
    if (!crateRoot) return undefined;
    
    // Look for workspace root
    let current = crateRoot;
    while (current !== path.dirname(current)) {
      const cargoToml = path.join(current, 'Cargo.toml');
      try {
        const content = await fs.readFile(cargoToml, 'utf-8');
        if (content.includes('[workspace]')) {
          return current;
        }
      } catch {
        // Continue searching
      }
      const parent = path.dirname(current);
      if (parent === current || !parent.startsWith(projectDir)) break;
      current = parent;
    }
    
    return crateRoot;
  },
  async spawn(root) {
    const bin = which('rust-analyzer');
    if (!bin) {
      console.log('[LSP] rust-analyzer not found');
      return undefined;
    }
    return {
      process: spawn(bin, [], { cwd: root }),
    };
  },
};

export const Ruby: LSPServerInfo = {
  id: 'ruby',
  extensions: ['.rb', '.rake', '.gemspec', '.ru'],
  root: NearestRoot(['Gemfile']),
  async spawn(root) {
    let bin = which('rubocop');
    if (!bin) {
      const globalBin = path.join(BIN_DIR, 'rubocop');
      if (await pathExists(globalBin)) {
        bin = globalBin;
      } else {
        console.log('[LSP] rubocop not found');
        return undefined;
      }
    }
    return {
      process: spawn(bin, ['--lsp'], { cwd: root }),
    };
  },
};

export const Elixir: LSPServerInfo = {
  id: 'elixir',
  extensions: ['.ex', '.exs'],
  root: NearestRoot(['mix.exs', 'mix.lock']),
  async spawn(root) {
    const bin = which('elixir-ls');
    if (!bin) {
      console.log('[LSP] elixir-ls not found');
      return undefined;
    }
    return {
      process: spawn(bin, [], { cwd: root }),
    };
  },
};

export const Zig: LSPServerInfo = {
  id: 'zig',
  extensions: ['.zig', '.zon'],
  root: NearestRoot(['build.zig']),
  async spawn(root) {
    let bin = which('zls');
    if (!bin) {
      const globalBin = path.join(BIN_DIR, 'zls');
      if (await pathExists(globalBin)) {
        bin = globalBin;
      } else {
        console.log('[LSP] zls not found');
        return undefined;
      }
    }
    return {
      process: spawn(bin, [], { cwd: root }),
    };
  },
};

export const CSharp: LSPServerInfo = {
  id: 'csharp',
  extensions: ['.cs'],
  root: NearestRoot(['.sln', '.csproj', 'global.json']),
  async spawn(root) {
    let bin = which('csharp-ls');
    if (!bin) {
      const globalBin = path.join(BIN_DIR, 'csharp-ls');
      if (await pathExists(globalBin)) {
        bin = globalBin;
      } else {
        console.log('[LSP] csharp-ls not found');
        return undefined;
      }
    }
    return {
      process: spawn(bin, [], { cwd: root }),
    };
  },
};

export const FSharp: LSPServerInfo = {
  id: 'fsharp',
  extensions: ['.fs', '.fsi', '.fsx', '.fsscript'],
  root: NearestRoot(['.sln', '.fsproj', 'global.json']),
  async spawn(root) {
    let bin = which('fsautocomplete');
    if (!bin) {
      const globalBin = path.join(BIN_DIR, 'fsautocomplete');
      if (await pathExists(globalBin)) {
        bin = globalBin;
      } else {
        console.log('[LSP] fsautocomplete not found');
        return undefined;
      }
    }
    return {
      process: spawn(bin, [], { cwd: root }),
    };
  },
};

export const Swift: LSPServerInfo = {
  id: 'swift',
  extensions: ['.swift'],
  root: NearestRoot(['Package.swift']),
  async spawn(root) {
    let bin = which('sourcekit-lsp');
    if (!bin) {
      // Try xcrun on macOS
      if (process.platform === 'darwin') {
        try {
          const { execSync } = await import('child_process');
          bin = execSync('xcrun --find sourcekit-lsp', { encoding: 'utf-8' }).trim();
        } catch {
          // Not found
        }
      }
    }
    if (!bin) {
      console.log('[LSP] sourcekit-lsp not found');
      return undefined;
    }
    return {
      process: spawn(bin, [], { cwd: root }),
    };
  },
};

export const Clangd: LSPServerInfo = {
  id: 'clangd',
  extensions: ['.c', '.cpp', '.cc', '.cxx', '.c++', '.h', '.hpp', '.hh', '.hxx', '.h++'],
  root: NearestRoot(['compile_commands.json', 'compile_flags.txt', '.clangd', 'CMakeLists.txt', 'Makefile']),
  async spawn(root) {
    let bin = which('clangd');
    if (!bin) {
      const globalBin = path.join(BIN_DIR, 'clangd');
      if (await pathExists(globalBin)) {
        bin = globalBin;
      } else {
        console.log('[LSP] clangd not found');
        return undefined;
      }
    }
    return {
      process: spawn(bin, ['--background-index', '--clang-tidy'], { cwd: root }),
    };
  },
};

export const Vue: LSPServerInfo = {
  id: 'vue',
  extensions: ['.vue'],
  root: NearestRoot(['package-lock.json', 'bun.lockb', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock']),
  async spawn(root) {
    let bin = which('vue-language-server');
    if (!bin) {
      const globalBin = path.join(BIN_DIR, 'node_modules', '@vue', 'language-server', 'bin', 'vue-language-server.js');
      if (await pathExists(globalBin)) {
        bin = 'bun';
        return {
          process: spawn(bin, ['run', globalBin, '--stdio'], { cwd: root }),
        };
      }
      console.log('[LSP] vue-language-server not found');
      return undefined;
    }
    return {
      process: spawn(bin, ['--stdio'], { cwd: root }),
    };
  },
};

export const Biome: LSPServerInfo = {
  id: 'biome',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.jsonc', '.css'],
  root: NearestRoot(['biome.json', 'biome.jsonc']),
  async spawn(root) {
    const localBin = path.join(root, 'node_modules', '.bin', 'biome');
    let bin = (await pathExists(localBin)) ? localBin : which('biome');
    
    if (!bin) {
      console.log('[LSP] biome not found');
      return undefined;
    }
    
    return {
      process: spawn(bin, ['lsp-proxy', '--stdio'], { cwd: root }),
    };
  },
};

// ============================================
// Server Registry
// ============================================

export const ALL_SERVERS: LSPServerInfo[] = [
  Deno,  // Check Deno first (more specific)
  TypeScript,
  Python,
  Go,
  Rust,
  Ruby,
  Elixir,
  Zig,
  CSharp,
  FSharp,
  Swift,
  Clangd,
  Vue,
  Biome,
];

/**
 * Get the appropriate LSP server for a file
 */
export function getServerForFile(filePath: string): LSPServerInfo | undefined {
  const ext = path.extname(filePath).toLowerCase();
  
  // Special handling for Deno vs TypeScript
  // This would need async check for deno.json, simplified here
  
  return ALL_SERVERS.find(server => server.extensions.includes(ext));
}

/**
 * Get all supported file extensions
 */
export function getSupportedExtensions(): string[] {
  const extensions = new Set<string>();
  for (const server of ALL_SERVERS) {
    for (const ext of server.extensions) {
      extensions.add(ext);
    }
  }
  return Array.from(extensions);
}

/**
 * Get server by ID
 */
export function getServerById(id: string): LSPServerInfo | undefined {
  return ALL_SERVERS.find(server => server.id === id);
}
