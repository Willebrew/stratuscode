/**
 * LSP Server Registry
 *
 * Auto-detection, auto-installation, and spawning of language servers.
 * When a server binary is missing, it is automatically installed into
 * ~/.stratuscode/bin/ using the appropriate strategy (bun install, go install,
 * gem install, or GitHub release download).
 *
 * Set STRATUSCODE_DISABLE_LSP_DOWNLOAD=1 to disable auto-installation.
 */

import { spawn as spawnProcess, execFile, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

const execFileAsync = promisify(execFile);

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

/**
 * Find a binary by name. Searches:
 * 1. System PATH
 * 2. BIN_DIR/node_modules/.bin/ (bun-installed npm packages)
 * 3. BIN_DIR/ directly (go install, gem, github releases)
 */
const which = async (cmd: string): Promise<string | null> => {
  const ext = process.platform === 'win32' ? '.exe' : '';

  // Search PATH
  const paths = (process.env.PATH || '').split(path.delimiter);
  for (const p of paths) {
    const full = path.join(p, cmd + ext);
    if (await pathExists(full)) return full;
  }

  // Search BIN_DIR/node_modules/.bin/
  const nmBin = path.join(BIN_DIR, 'node_modules', '.bin', cmd + ext);
  if (await pathExists(nmBin)) return nmBin;

  // Search BIN_DIR directly
  const directBin = path.join(BIN_DIR, cmd + ext);
  if (await pathExists(directBin)) return directBin;

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
// Auto-Install Infrastructure
// ============================================

const installLocks = new Map<string, Promise<boolean>>();
const installFailed = new Set<string>();

function autoInstallDisabled(): boolean {
  const v = process.env.STRATUSCODE_DISABLE_LSP_DOWNLOAD;
  return v === '1' || v === 'true';
}

async function ensureBinDir(): Promise<void> {
  await fs.mkdir(BIN_DIR, { recursive: true });
}

type InstallStrategy = 'bun' | 'go' | 'gem' | 'github-release' | 'manual';

interface InstallConfig {
  strategy: InstallStrategy;
  /** npm package names for bun install */
  packages?: string[];
  /** Go module path for go install */
  goModule?: string;
  /** Gem name for gem install */
  gemName?: string;
  /** GitHub repo owner/name */
  githubRepo?: string;
  /** Custom function to pick the right asset from a release */
  assetMatcher?: (assets: GithubAsset[]) => GithubAsset | undefined;
  /** Binary name to look for after extraction (defaults to serverId) */
  binaryName?: string;
  /** Message for manual install */
  manualMessage?: string;
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  assets: GithubAsset[];
}

async function autoInstall(serverId: string, config: InstallConfig): Promise<boolean> {
  if (autoInstallDisabled()) {
    return false;
  }
  if (installFailed.has(serverId)) {
    return false;
  }

  // Deduplicate concurrent installs
  const existing = installLocks.get(serverId);
  if (existing) return existing;

  const promise = doInstall(serverId, config);
  installLocks.set(serverId, promise);
  try {
    return await promise;
  } finally {
    installLocks.delete(serverId);
  }
}

async function doInstall(serverId: string, config: InstallConfig): Promise<boolean> {
  if (config.strategy === 'manual') {
    if (config.manualMessage) {
      console.log(`[LSP] ${config.manualMessage}`);
    }
    installFailed.add(serverId);
    return false;
  }

  await ensureBinDir();
  console.log(`[LSP] Installing ${serverId}...`);

  try {
    switch (config.strategy) {
      case 'bun': {
        const bunBin = await which('bun');
        if (!bunBin) {
          console.log(`[LSP] bun not found, cannot install ${serverId}`);
          installFailed.add(serverId);
          return false;
        }
        await execFileAsync(bunBin, ['install', ...config.packages!], {
          cwd: BIN_DIR,
          timeout: 60_000,
        });
        console.log(`[LSP] Installed ${serverId}`);
        return true;
      }
      case 'go': {
        const goBin = await which('go');
        if (!goBin) {
          console.log(`[LSP] go not found, cannot install ${serverId}`);
          installFailed.add(serverId);
          return false;
        }
        await execFileAsync(goBin, ['install', config.goModule!], {
          env: { ...process.env, GOBIN: BIN_DIR },
          timeout: 120_000,
        });
        console.log(`[LSP] Installed ${serverId}`);
        return true;
      }
      case 'gem': {
        const gemBin = await which('gem');
        if (!gemBin) {
          console.log(`[LSP] gem not found, cannot install ${serverId}`);
          installFailed.add(serverId);
          return false;
        }
        await execFileAsync(gemBin, [
          'install', config.gemName!,
          '--bindir', BIN_DIR,
          '--no-document',
        ], { timeout: 120_000 });
        console.log(`[LSP] Installed ${serverId}`);
        return true;
      }
      case 'github-release': {
        return await downloadGithubRelease(serverId, config);
      }
    }
  } catch (err) {
    console.log(`[LSP] Failed to install ${serverId}: ${(err as Error).message}`);
    installFailed.add(serverId);
    return false;
  }
  return false;
}

// ============================================
// GitHub Release Downloader
// ============================================

function platformName(): string {
  switch (process.platform) {
    case 'darwin': return 'macos';
    case 'linux': return 'linux';
    case 'win32': return 'windows';
    default: return process.platform;
  }
}

function archName(): string {
  switch (process.arch) {
    case 'x64': return 'x86_64';
    case 'arm64': return 'aarch64';
    default: return process.arch;
  }
}

function defaultAssetMatcher(assets: GithubAsset[]): GithubAsset | undefined {
  const plat = platformName();
  const arch = archName();
  // Try exact match first: both platform and arch in name
  let match = assets.find(a => {
    const n = a.name.toLowerCase();
    return n.includes(plat) && n.includes(arch);
  });
  if (match) return match;

  // macOS fallback: try "mac" instead of "macos"
  if (process.platform === 'darwin') {
    match = assets.find(a => {
      const n = a.name.toLowerCase();
      return n.includes('mac') && n.includes(arch);
    });
    if (match) return match;
  }

  return undefined;
}

async function downloadGithubRelease(serverId: string, config: InstallConfig): Promise<boolean> {
  try {
    const apiUrl = `https://api.github.com/repos/${config.githubRepo}/releases/latest`;
    const resp = await fetch(apiUrl, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'stratuscode-lsp' },
    });

    if (!resp.ok) {
      console.log(`[LSP] Failed to fetch releases for ${serverId} (HTTP ${resp.status})`);
      installFailed.add(serverId);
      return false;
    }

    const release = (await resp.json()) as GithubRelease;
    const matcher = config.assetMatcher || defaultAssetMatcher;
    const asset = matcher(release.assets);

    if (!asset) {
      console.log(`[LSP] No matching release asset for ${serverId} (${platformName()}-${archName()})`);
      installFailed.add(serverId);
      return false;
    }

    // Download
    const dlResp = await fetch(asset.browser_download_url, {
      headers: { 'User-Agent': 'stratuscode-lsp' },
    });
    if (!dlResp.ok || !dlResp.body) {
      console.log(`[LSP] Failed to download ${asset.name}`);
      installFailed.add(serverId);
      return false;
    }

    const tmpDir = path.join(BIN_DIR, `_download_${serverId}_${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    const archivePath = path.join(tmpDir, asset.name);
    const buffer = Buffer.from(await dlResp.arrayBuffer());
    await fs.writeFile(archivePath, buffer);

    // Extract
    const name = asset.name.toLowerCase();
    if (name.endsWith('.tar.gz') || name.endsWith('.tgz')) {
      await execFileAsync('tar', ['xzf', archivePath, '-C', tmpDir]);
    } else if (name.endsWith('.tar.xz')) {
      await execFileAsync('tar', ['xJf', archivePath, '-C', tmpDir]);
    } else if (name.endsWith('.zip')) {
      await execFileAsync('unzip', ['-o', archivePath, '-d', tmpDir]);
    } else {
      // Assume it's a raw binary
      const binaryName = config.binaryName || serverId;
      const dest = path.join(BIN_DIR, binaryName);
      await fs.rename(archivePath, dest);
      await fs.chmod(dest, 0o755);
      await fs.rm(tmpDir, { recursive: true, force: true });
      console.log(`[LSP] Installed ${serverId}`);
      return true;
    }

    // Find the binary in the extracted files
    const binaryName = config.binaryName || serverId;
    const found = await findBinaryRecursive(tmpDir, binaryName);
    if (found) {
      const dest = path.join(BIN_DIR, binaryName);
      await fs.copyFile(found, dest);
      await fs.chmod(dest, 0o755);
      await fs.rm(tmpDir, { recursive: true, force: true });
      console.log(`[LSP] Installed ${serverId}`);
      return true;
    }

    console.log(`[LSP] Could not find ${binaryName} binary in extracted release`);
    await fs.rm(tmpDir, { recursive: true, force: true });
    installFailed.add(serverId);
    return false;
  } catch (err) {
    console.log(`[LSP] Failed to install ${serverId}: ${(err as Error).message}`);
    installFailed.add(serverId);
    return false;
  }
}

async function findBinaryRecursive(dir: string, name: string): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findBinaryRecursive(full, name);
      if (found) return found;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

// ============================================
// Language Server Definitions
// ============================================

export const TypeScript: LSPServerInfo = {
  id: 'typescript',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'],
  root: NearestRoot(['package-lock.json', 'bun.lockb', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock', 'package.json']),
  async spawn(root) {
    let bin = await which('typescript-language-server');
    if (!bin) {
      const ok = await autoInstall('typescript', {
        strategy: 'bun',
        packages: ['typescript-language-server', 'typescript'],
      });
      if (ok) bin = await which('typescript-language-server');
    }
    if (!bin) return undefined;
    return {
      process: spawnProcess(bin, ['--stdio'], { cwd: root }),
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
    const bin = await which('deno');
    if (!bin) {
      await autoInstall('deno', {
        strategy: 'manual',
        manualMessage: 'deno not found. Install from https://deno.land',
      });
      return undefined;
    }
    return {
      process: spawnProcess(bin, ['lsp'], { cwd: root }),
    };
  },
};

export const Python: LSPServerInfo = {
  id: 'python',
  extensions: ['.py', '.pyi'],
  root: NearestRoot(['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile', 'pyrightconfig.json']),
  async spawn(root) {
    let bin = await which('pyright-langserver');
    const args: string[] = [];

    if (!bin) {
      // Try auto-install
      const ok = await autoInstall('python', {
        strategy: 'bun',
        packages: ['pyright'],
      });
      if (ok) bin = await which('pyright-langserver');
    }

    if (!bin) {
      // Fallback: check for the JS entry point directly
      const globalBin = path.join(BIN_DIR, 'node_modules', 'pyright', 'dist', 'pyright-langserver.js');
      if (await pathExists(globalBin)) {
        bin = await which('bun');
        if (!bin) return undefined;
        args.push('run', globalBin);
      } else {
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
      process: spawnProcess(bin, args, { cwd: root }),
      initialization,
    };
  },
};

export const Go: LSPServerInfo = {
  id: 'go',
  extensions: ['.go'],
  root: async (file, projectDir) => {
    const workRoot = await findUp(['go.work'], path.dirname(file), projectDir);
    if (workRoot) return workRoot;
    return findUp(['go.mod', 'go.sum'], path.dirname(file), projectDir);
  },
  async spawn(root) {
    let bin = await which('gopls');
    if (!bin) {
      const ok = await autoInstall('go', {
        strategy: 'go',
        goModule: 'golang.org/x/tools/gopls@latest',
      });
      if (ok) bin = await which('gopls');
    }
    if (!bin) return undefined;
    return {
      process: spawnProcess(bin, [], { cwd: root }),
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
    const bin = await which('rust-analyzer');
    if (!bin) {
      await autoInstall('rust', {
        strategy: 'manual',
        manualMessage: 'rust-analyzer not found. Install via: rustup component add rust-analyzer',
      });
      return undefined;
    }
    return {
      process: spawnProcess(bin, [], { cwd: root }),
    };
  },
};

export const Ruby: LSPServerInfo = {
  id: 'ruby',
  extensions: ['.rb', '.rake', '.gemspec', '.ru'],
  root: NearestRoot(['Gemfile']),
  async spawn(root) {
    let bin = await which('rubocop');
    if (!bin) {
      const ok = await autoInstall('ruby', {
        strategy: 'gem',
        gemName: 'rubocop',
      });
      if (ok) bin = await which('rubocop');
    }
    if (!bin) return undefined;
    return {
      process: spawnProcess(bin, ['--lsp'], { cwd: root }),
    };
  },
};

export const Elixir: LSPServerInfo = {
  id: 'elixir',
  extensions: ['.ex', '.exs'],
  root: NearestRoot(['mix.exs', 'mix.lock']),
  async spawn(root) {
    const bin = await which('elixir-ls');
    if (!bin) {
      await autoInstall('elixir', {
        strategy: 'manual',
        manualMessage: 'elixir-ls not found. See https://github.com/elixir-lsp/elixir-ls for installation',
      });
      return undefined;
    }
    return {
      process: spawnProcess(bin, [], { cwd: root }),
    };
  },
};

export const Zig: LSPServerInfo = {
  id: 'zig',
  extensions: ['.zig', '.zon'],
  root: NearestRoot(['build.zig']),
  async spawn(root) {
    let bin = await which('zls');
    if (!bin) {
      const ok = await autoInstall('zig', {
        strategy: 'github-release',
        githubRepo: 'zigtools/zls',
        binaryName: 'zls',
        assetMatcher: (assets) => {
          const arch = archName();
          const plat = process.platform === 'darwin' ? 'macos' : process.platform;
          return assets.find(a => {
            const n = a.name.toLowerCase();
            return n.includes(arch) && n.includes(plat) && (n.endsWith('.tar.xz') || n.endsWith('.tar.gz') || n.endsWith('.zip'));
          });
        },
      });
      if (ok) bin = await which('zls');
    }
    if (!bin) return undefined;
    return {
      process: spawnProcess(bin, [], { cwd: root }),
    };
  },
};

export const CSharp: LSPServerInfo = {
  id: 'csharp',
  extensions: ['.cs'],
  root: NearestRoot(['.sln', '.csproj', 'global.json']),
  async spawn(root) {
    const bin = await which('csharp-ls');
    if (!bin) {
      await autoInstall('csharp', {
        strategy: 'manual',
        manualMessage: 'csharp-ls not found. Install via: dotnet tool install csharp-ls -g',
      });
      return undefined;
    }
    return {
      process: spawnProcess(bin, [], { cwd: root }),
    };
  },
};

export const FSharp: LSPServerInfo = {
  id: 'fsharp',
  extensions: ['.fs', '.fsi', '.fsx', '.fsscript'],
  root: NearestRoot(['.sln', '.fsproj', 'global.json']),
  async spawn(root) {
    const bin = await which('fsautocomplete');
    if (!bin) {
      await autoInstall('fsharp', {
        strategy: 'manual',
        manualMessage: 'fsautocomplete not found. Install via: dotnet tool install fsautocomplete -g',
      });
      return undefined;
    }
    return {
      process: spawnProcess(bin, [], { cwd: root }),
    };
  },
};

export const Swift: LSPServerInfo = {
  id: 'swift',
  extensions: ['.swift'],
  root: NearestRoot(['Package.swift']),
  async spawn(root) {
    let bin = await which('sourcekit-lsp');
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
      console.log('[LSP] sourcekit-lsp not found. Install Xcode or Swift toolchain.');
      return undefined;
    }
    return {
      process: spawnProcess(bin, [], { cwd: root }),
    };
  },
};

export const Clangd: LSPServerInfo = {
  id: 'clangd',
  extensions: ['.c', '.cpp', '.cc', '.cxx', '.c++', '.h', '.hpp', '.hh', '.hxx', '.h++'],
  root: NearestRoot(['compile_commands.json', 'compile_flags.txt', '.clangd', 'CMakeLists.txt', 'Makefile']),
  async spawn(root) {
    let bin = await which('clangd');
    if (!bin) {
      const ok = await autoInstall('clangd', {
        strategy: 'github-release',
        githubRepo: 'clangd/clangd',
        binaryName: 'clangd',
        assetMatcher: (assets) => {
          // clangd uses "mac" not "macos", and "arm64" not "aarch64"
          const platNames = process.platform === 'darwin' ? ['mac'] : [platformName()];
          const archNames = process.arch === 'arm64' ? ['aarch64', 'arm64'] : ['x86_64'];
          return assets.find(a => {
            const n = a.name.toLowerCase();
            return platNames.some(p => n.includes(p)) && archNames.some(ar => n.includes(ar)) && (n.endsWith('.zip') || n.endsWith('.tar.gz'));
          });
        },
      });
      if (ok) bin = await which('clangd');
    }
    if (!bin) return undefined;
    return {
      process: spawnProcess(bin, ['--background-index', '--clang-tidy'], { cwd: root }),
    };
  },
};

export const Vue: LSPServerInfo = {
  id: 'vue',
  extensions: ['.vue'],
  root: NearestRoot(['package-lock.json', 'bun.lockb', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock']),
  async spawn(root) {
    let bin = await which('vue-language-server');
    if (!bin) {
      const ok = await autoInstall('vue', {
        strategy: 'bun',
        packages: ['@vue/language-server'],
      });
      if (ok) {
        // bun install puts the .js entry in node_modules, run via bun
        const js = path.join(BIN_DIR, 'node_modules', '@vue', 'language-server', 'bin', 'vue-language-server.js');
        if (await pathExists(js)) {
          const bunBin = await which('bun');
          if (bunBin) {
            return {
              process: spawnProcess(bunBin, ['run', js, '--stdio'], { cwd: root }),
            };
          }
        }
        // Try which again in case a .bin symlink was created
        bin = await which('vue-language-server');
      }
    }
    if (!bin) {
      // Check existing fallback path
      const globalBin = path.join(BIN_DIR, 'node_modules', '@vue', 'language-server', 'bin', 'vue-language-server.js');
      if (await pathExists(globalBin)) {
        const bunBin = await which('bun');
        if (bunBin) {
          return {
            process: spawnProcess(bunBin, ['run', globalBin, '--stdio'], { cwd: root }),
          };
        }
      }
      return undefined;
    }
    return {
      process: spawnProcess(bin, ['--stdio'], { cwd: root }),
    };
  },
};

export const Biome: LSPServerInfo = {
  id: 'biome',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.jsonc', '.css'],
  root: NearestRoot(['biome.json', 'biome.jsonc']),
  async spawn(root) {
    // Check local project first
    const localBin = path.join(root, 'node_modules', '.bin', 'biome');
    if (await pathExists(localBin)) {
      return {
        process: spawnProcess(localBin, ['lsp-proxy', '--stdio'], { cwd: root }),
      };
    }

    let bin = await which('biome');
    if (!bin) {
      const ok = await autoInstall('biome', {
        strategy: 'bun',
        packages: ['@biomejs/biome'],
      });
      if (ok) bin = await which('biome');
    }
    if (!bin) return undefined;
    return {
      process: spawnProcess(bin, ['lsp-proxy', '--stdio'], { cwd: root }),
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
export function getServersForFile(filePath: string): LSPServerInfo[] {
  const ext = path.extname(filePath).toLowerCase();
  return ALL_SERVERS.filter(server => server.extensions.includes(ext));
}

/** @deprecated Use getServersForFile (returns all candidates) */
export function getServerForFile(filePath: string): LSPServerInfo | undefined {
  return getServersForFile(filePath)[0];
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
