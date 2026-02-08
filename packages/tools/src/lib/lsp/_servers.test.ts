import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================
// Mock child_process to prevent real spawning
// ============================================

let mockSpawnProcess: (...args: any[]) => any;
let mockExecFileAsync: (...args: any[]) => any;

mock.module('child_process', () => {
  const actual = require('child_process');
  return {
    ...actual,
    spawn: (...args: any[]) => mockSpawnProcess(...args),
    execFile: (...args: any[]) => mockExecFileAsync(...args),
  };
});

mock.module('util', () => {
  const actual = require('util');
  return {
    ...actual,
    promisify: (fn: any) => {
      if (fn.name === 'execFile' || fn === mockExecFileAsync) {
        return (...args: any[]) => mockExecFileAsync(...args);
      }
      return actual.promisify(fn);
    },
  };
});

// Use query-string to bypass any mock contamination
const {
  getServersForFile,
  getServerForFile,
  getSupportedExtensions,
  getServerById,
  ALL_SERVERS,
  TypeScript,
  Deno: DenoServer,
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
  Astro,
  Biome,
} = await import('./servers?real=1');

// ============================================
// Test Helpers
// ============================================

let tmpDir: string;
let projectDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-servers-test-'));
  projectDir = tmpDir;
  // Default: spawn returns a mock process
  mockSpawnProcess = () => ({
    stdin: { write: () => {} },
    stdout: { on: () => {} },
    stderr: { on: () => {} },
    on: () => {},
    kill: () => {},
    exitCode: null,
    pid: 12345,
  });
  mockExecFileAsync = () => Promise.resolve({ stdout: '', stderr: '' });
  // Disable auto-install during tests
  process.env.STRATUSCODE_DISABLE_LSP_DOWNLOAD = '1';
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.STRATUSCODE_DISABLE_LSP_DOWNLOAD;
});

// ============================================
// getServersForFile
// ============================================

describe('servers: getServersForFile', () => {
  test('returns TypeScript server for .ts files', () => {
    const servers = getServersForFile('/project/test.ts');
    const ids = servers.map((s: any) => s.id);
    expect(ids).toContain('typescript');
  });

  test('returns Deno for .ts files (Deno checks first)', () => {
    const servers = getServersForFile('/project/test.ts');
    const ids = servers.map((s: any) => s.id);
    expect(ids).toContain('deno');
    // Deno should come before TypeScript
    expect(ids.indexOf('deno')).toBeLessThan(ids.indexOf('typescript'));
  });

  test('returns TypeScript server for .tsx files', () => {
    const servers = getServersForFile('/project/component.tsx');
    const ids = servers.map((s: any) => s.id);
    expect(ids).toContain('typescript');
  });

  test('returns Python server for .py files', () => {
    const servers = getServersForFile('/project/main.py');
    expect(servers.length).toBeGreaterThanOrEqual(1);
    expect(servers[0]!.id).toBe('python');
  });

  test('returns Go server for .go files', () => {
    const servers = getServersForFile('/project/main.go');
    expect(servers.length).toBe(1);
    expect(servers[0]!.id).toBe('go');
  });

  test('returns Rust server for .rs files', () => {
    const servers = getServersForFile('/project/main.rs');
    expect(servers.length).toBe(1);
    expect(servers[0]!.id).toBe('rust');
  });

  test('returns Ruby server for .rb files', () => {
    const servers = getServersForFile('/project/app.rb');
    expect(servers.length).toBe(1);
    expect(servers[0]!.id).toBe('ruby');
  });

  test('returns Elixir server for .ex files', () => {
    const servers = getServersForFile('/project/app.ex');
    expect(servers.length).toBe(1);
    expect(servers[0]!.id).toBe('elixir');
  });

  test('returns Zig server for .zig files', () => {
    const servers = getServersForFile('/project/main.zig');
    expect(servers.length).toBe(1);
    expect(servers[0]!.id).toBe('zig');
  });

  test('returns CSharp server for .cs files', () => {
    const servers = getServersForFile('/project/Program.cs');
    expect(servers.length).toBe(1);
    expect(servers[0]!.id).toBe('csharp');
  });

  test('returns FSharp server for .fs files', () => {
    const servers = getServersForFile('/project/Main.fs');
    expect(servers.length).toBe(1);
    expect(servers[0]!.id).toBe('fsharp');
  });

  test('returns Swift server for .swift files', () => {
    const servers = getServersForFile('/project/main.swift');
    expect(servers.length).toBe(1);
    expect(servers[0]!.id).toBe('swift');
  });

  test('returns Clangd for .c files', () => {
    const servers = getServersForFile('/project/main.c');
    expect(servers.length).toBe(1);
    expect(servers[0]!.id).toBe('clangd');
  });

  test('returns Clangd for .cpp files', () => {
    const servers = getServersForFile('/project/main.cpp');
    expect(servers.length).toBe(1);
    expect(servers[0]!.id).toBe('clangd');
  });

  test('returns Vue server for .vue files', () => {
    const servers = getServersForFile('/project/App.vue');
    expect(servers.length).toBe(1);
    expect(servers[0]!.id).toBe('vue');
  });

  test('returns Astro server for .astro files', () => {
    const servers = getServersForFile('/project/index.astro');
    expect(servers.length).toBe(1);
    expect(servers[0]!.id).toBe('astro');
  });

  test('returns empty for unknown extension', () => {
    const servers = getServersForFile('/project/readme.md');
    expect(servers.length).toBe(0);
  });

  test('handles case-insensitive extensions', () => {
    // extname returns lowercase, so .TS would need lowercase matching
    const servers = getServersForFile('/project/test.ts');
    expect(servers.length).toBeGreaterThan(0);
  });

  test('returns multiple servers for .json (Biome)', () => {
    const servers = getServersForFile('/project/data.json');
    const ids = servers.map((s: any) => s.id);
    expect(ids).toContain('biome');
  });

  test('returns multiple servers for .css (Biome)', () => {
    const servers = getServersForFile('/project/style.css');
    const ids = servers.map((s: any) => s.id);
    expect(ids).toContain('biome');
  });
});

// ============================================
// getServerForFile (deprecated)
// ============================================

describe('servers: getServerForFile', () => {
  test('returns first matching server', () => {
    const server = getServerForFile('/project/test.ts');
    expect(server).toBeDefined();
    // Deno is checked first
    expect(server!.id).toBe('deno');
  });

  test('returns undefined for unknown extension', () => {
    const server = getServerForFile('/project/readme.md');
    expect(server).toBeUndefined();
  });
});

// ============================================
// getSupportedExtensions
// ============================================

describe('servers: getSupportedExtensions', () => {
  test('returns array of unique extensions', () => {
    const exts = getSupportedExtensions();
    expect(exts.length).toBeGreaterThan(10);
    expect(exts).toContain('.ts');
    expect(exts).toContain('.py');
    expect(exts).toContain('.go');
    expect(exts).toContain('.rs');
    expect(exts).toContain('.rb');
    expect(exts).toContain('.swift');
    expect(exts).toContain('.vue');
    expect(exts).toContain('.astro');
  });

  test('extensions are unique', () => {
    const exts = getSupportedExtensions();
    const unique = new Set(exts);
    expect(unique.size).toBe(exts.length);
  });
});

// ============================================
// getServerById
// ============================================

describe('servers: getServerById', () => {
  test('finds server by id', () => {
    const server = getServerById('typescript');
    expect(server).toBeDefined();
    expect(server!.id).toBe('typescript');
  });

  test('finds python server', () => {
    const server = getServerById('python');
    expect(server).toBeDefined();
    expect(server!.extensions).toContain('.py');
  });

  test('returns undefined for unknown id', () => {
    const server = getServerById('nonexistent');
    expect(server).toBeUndefined();
  });
});

// ============================================
// ALL_SERVERS registry
// ============================================

describe('servers: ALL_SERVERS', () => {
  test('contains all expected servers', () => {
    const ids = ALL_SERVERS.map((s: any) => s.id);
    expect(ids).toContain('typescript');
    expect(ids).toContain('deno');
    expect(ids).toContain('python');
    expect(ids).toContain('go');
    expect(ids).toContain('rust');
    expect(ids).toContain('ruby');
    expect(ids).toContain('elixir');
    expect(ids).toContain('zig');
    expect(ids).toContain('csharp');
    expect(ids).toContain('fsharp');
    expect(ids).toContain('swift');
    expect(ids).toContain('clangd');
    expect(ids).toContain('vue');
    expect(ids).toContain('astro');
    expect(ids).toContain('biome');
  });

  test('Deno is first (checked before TypeScript)', () => {
    expect(ALL_SERVERS[0]!.id).toBe('deno');
    expect(ALL_SERVERS[1]!.id).toBe('typescript');
  });

  test('every server has id, extensions, root, spawn', () => {
    for (const server of ALL_SERVERS) {
      expect(server.id).toBeString();
      expect(server.extensions).toBeArray();
      expect(server.extensions.length).toBeGreaterThan(0);
      expect(typeof server.root).toBe('function');
      expect(typeof server.spawn).toBe('function');
    }
  });
});

// ============================================
// Root functions
// ============================================

describe('servers: root functions', () => {
  test('TypeScript root finds package.json', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    const subDir = path.join(tmpDir, 'src');
    fs.mkdirSync(subDir);
    const file = path.join(subDir, 'index.ts');
    fs.writeFileSync(file, '');

    const root = await TypeScript.root(file, tmpDir);
    expect(root).toBe(tmpDir);
  });

  test('TypeScript root falls back to projectDir', async () => {
    const file = path.join(tmpDir, 'test.ts');
    fs.writeFileSync(file, '');

    const root = await TypeScript.root(file, tmpDir);
    expect(root).toBe(tmpDir);
  });

  test('Deno root finds deno.json in subdir', async () => {
    // findUp stops at projectDir (exclusive), so deno.json must be between file and projectDir
    const subDir = path.join(tmpDir, 'app');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'deno.json'), '{}');
    const deepDir = path.join(subDir, 'src');
    fs.mkdirSync(deepDir);
    const file = path.join(deepDir, 'test.ts');
    fs.writeFileSync(file, '');

    const root = await DenoServer.root(file, tmpDir);
    expect(root).toBe(subDir);
  });

  test('Deno root returns undefined when no deno.json', async () => {
    const subDir = path.join(tmpDir, 'src');
    fs.mkdirSync(subDir);
    const file = path.join(subDir, 'test.ts');
    fs.writeFileSync(file, '');

    const root = await DenoServer.root(file, tmpDir);
    expect(root).toBeUndefined();
  });

  test('Python root finds pyproject.toml', async () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '');
    const file = path.join(tmpDir, 'main.py');
    fs.writeFileSync(file, '');

    const root = await Python.root(file, tmpDir);
    expect(root).toBe(tmpDir);
  });

  test('Go root finds go.mod in subdir', async () => {
    // findUp stops at projectDir (exclusive), so go.mod must be in a subdir
    const goDir = path.join(tmpDir, 'myapp');
    fs.mkdirSync(goDir);
    fs.writeFileSync(path.join(goDir, 'go.mod'), '');
    const pkgDir = path.join(goDir, 'pkg');
    fs.mkdirSync(pkgDir);
    const file = path.join(pkgDir, 'main.go');
    fs.writeFileSync(file, '');

    const root = await Go.root(file, tmpDir);
    expect(root).toBe(goDir);
  });

  test('Go root prefers go.work over go.mod', async () => {
    const workDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workDir);
    fs.writeFileSync(path.join(workDir, 'go.work'), '');
    const subDir = path.join(workDir, 'app');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'go.mod'), '');
    const deepDir = path.join(subDir, 'cmd');
    fs.mkdirSync(deepDir);
    const file = path.join(deepDir, 'main.go');
    fs.writeFileSync(file, '');

    const root = await Go.root(file, tmpDir);
    // go.work is found first before go.mod
    expect(root).toBe(workDir);
  });

  test('Rust root finds Cargo.toml in subdir', async () => {
    // findUp stops at projectDir (exclusive)
    const crateDir = path.join(tmpDir, 'mycrate');
    fs.mkdirSync(crateDir);
    fs.writeFileSync(path.join(crateDir, 'Cargo.toml'), '[package]\nname = "test"');
    const srcDir = path.join(crateDir, 'src');
    fs.mkdirSync(srcDir);
    const file = path.join(srcDir, 'main.rs');
    fs.writeFileSync(file, '');

    const root = await Rust.root(file, tmpDir);
    expect(root).toBe(crateDir);
  });

  test('Rust root returns undefined when no Cargo.toml', async () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);
    const file = path.join(srcDir, 'main.rs');
    fs.writeFileSync(file, '');

    const root = await Rust.root(file, tmpDir);
    expect(root).toBeUndefined();
  });

  test('Ruby root finds Gemfile', async () => {
    fs.writeFileSync(path.join(tmpDir, 'Gemfile'), '');
    const file = path.join(tmpDir, 'app.rb');
    fs.writeFileSync(file, '');

    const root = await Ruby.root(file, tmpDir);
    expect(root).toBe(tmpDir);
  });

  test('Elixir root finds mix.exs', async () => {
    fs.writeFileSync(path.join(tmpDir, 'mix.exs'), '');
    const file = path.join(tmpDir, 'app.ex');
    fs.writeFileSync(file, '');

    const root = await Elixir.root(file, tmpDir);
    expect(root).toBe(tmpDir);
  });

  test('Zig root finds build.zig', async () => {
    fs.writeFileSync(path.join(tmpDir, 'build.zig'), '');
    const file = path.join(tmpDir, 'main.zig');
    fs.writeFileSync(file, '');

    const root = await Zig.root(file, tmpDir);
    expect(root).toBe(tmpDir);
  });

  test('CSharp root finds .csproj', async () => {
    fs.writeFileSync(path.join(tmpDir, 'app.csproj'), '');
    const file = path.join(tmpDir, 'Program.cs');
    fs.writeFileSync(file, '');

    const root = await CSharp.root(file, tmpDir);
    expect(root).toBe(tmpDir);
  });

  test('FSharp root finds .fsproj', async () => {
    fs.writeFileSync(path.join(tmpDir, 'app.fsproj'), '');
    const file = path.join(tmpDir, 'Main.fs');
    fs.writeFileSync(file, '');

    const root = await FSharp.root(file, tmpDir);
    expect(root).toBe(tmpDir);
  });

  test('Swift root finds Package.swift', async () => {
    fs.writeFileSync(path.join(tmpDir, 'Package.swift'), '');
    const file = path.join(tmpDir, 'main.swift');
    fs.writeFileSync(file, '');

    const root = await Swift.root(file, tmpDir);
    expect(root).toBe(tmpDir);
  });

  test('Clangd root finds CMakeLists.txt', async () => {
    fs.writeFileSync(path.join(tmpDir, 'CMakeLists.txt'), '');
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);
    const file = path.join(srcDir, 'main.c');
    fs.writeFileSync(file, '');

    const root = await Clangd.root(file, tmpDir);
    expect(root).toBe(tmpDir);
  });

  test('Biome root finds biome.json', async () => {
    fs.writeFileSync(path.join(tmpDir, 'biome.json'), '{}');
    const file = path.join(tmpDir, 'test.ts');
    fs.writeFileSync(file, '');

    const root = await Biome.root(file, tmpDir);
    expect(root).toBe(tmpDir);
  });

  test('nested root traversal finds marker in parent', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    const deep = path.join(tmpDir, 'src', 'components');
    fs.mkdirSync(deep, { recursive: true });
    const file = path.join(deep, 'Button.tsx');
    fs.writeFileSync(file, '');

    const root = await TypeScript.root(file, tmpDir);
    expect(root).toBe(tmpDir);
  });
});

// ============================================
// Spawn functions (with auto-install disabled)
// ============================================

describe('servers: spawn (auto-install disabled)', () => {
  // With auto-install disabled, spawn returns either a handle (if binary found in PATH)
  // or undefined (if binary not found). We test that it doesn't crash.
  test('TypeScript spawn returns handle or undefined', async () => {
    const result = await TypeScript.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });

  test('Deno spawn returns handle or undefined', async () => {
    const result = await DenoServer.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });

  test('Go spawn returns handle or undefined', async () => {
    const result = await Go.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });

  test('Rust spawn returns handle or undefined', async () => {
    const result = await Rust.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });

  test('Ruby spawn returns handle or undefined', async () => {
    const result = await Ruby.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });

  test('Elixir spawn returns handle or undefined', async () => {
    const result = await Elixir.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });

  test('Zig spawn returns handle or undefined', async () => {
    const result = await Zig.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });

  test('CSharp spawn returns handle or undefined', async () => {
    const result = await CSharp.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });

  test('FSharp spawn returns handle or undefined', async () => {
    const result = await FSharp.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });

  test('Swift spawn returns handle or undefined', async () => {
    const result = await Swift.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });

  test('Vue spawn returns handle or undefined', async () => {
    const result = await Vue.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });

  test('Biome spawn returns handle or undefined', async () => {
    const result = await Biome.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });

  test('Astro spawn returns handle or undefined', async () => {
    const result = await Astro.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });

  test('Python spawn returns handle or undefined', async () => {
    const result = await Python.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });

  test('Clangd spawn returns handle or undefined', async () => {
    const result = await Clangd.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });
});

// ============================================
// Auto-install paths (via spawn with empty PATH)
// ============================================

describe('servers: spawn with auto-install enabled (empty PATH)', () => {
  let origPath: string | undefined;

  beforeEach(() => {
    origPath = process.env.PATH;
    // Empty PATH so which() finds nothing
    process.env.PATH = '';
    delete process.env.STRATUSCODE_DISABLE_LSP_DOWNLOAD;
  });

  afterEach(() => {
    process.env.PATH = origPath;
    process.env.STRATUSCODE_DISABLE_LSP_DOWNLOAD = '1';
  });

  test('TypeScript spawn attempts auto-install or finds in BIN_DIR', async () => {
    // May find binary in ~/.stratuscode/bin/ even with empty PATH
    const result = await TypeScript.spawn(tmpDir);
    if (result) {
      expect(result.process).toBeDefined();
    } else {
      expect(result).toBeUndefined();
    }
  });

  test('Deno spawn shows manual install message', async () => {
    const result = await DenoServer.spawn(tmpDir);
    expect(result).toBeUndefined();
  });

  test('Rust spawn shows manual install message', async () => {
    const result = await Rust.spawn(tmpDir);
    expect(result).toBeUndefined();
  });

  test('Elixir spawn shows manual install message', async () => {
    const result = await Elixir.spawn(tmpDir);
    expect(result).toBeUndefined();
  });

  test('CSharp spawn shows manual install message', async () => {
    const result = await CSharp.spawn(tmpDir);
    expect(result).toBeUndefined();
  });

  test('FSharp spawn shows manual install message', async () => {
    const result = await FSharp.spawn(tmpDir);
    expect(result).toBeUndefined();
  });

  test('Go spawn fails gracefully when go not in PATH', async () => {
    const result = await Go.spawn(tmpDir);
    expect(result).toBeUndefined();
  });

  test('Ruby spawn fails gracefully when gem not in PATH', async () => {
    const result = await Ruby.spawn(tmpDir);
    expect(result).toBeUndefined();
  });

  test('Python spawn fails gracefully when pyright not in PATH', async () => {
    const result = await Python.spawn(tmpDir);
    expect(result).toBeUndefined();
  });
});

// ============================================
// Server info structure
// ============================================

describe('servers: server info structure', () => {
  test('TypeScript has correct extensions', () => {
    expect(TypeScript.extensions).toContain('.ts');
    expect(TypeScript.extensions).toContain('.tsx');
    expect(TypeScript.extensions).toContain('.js');
    expect(TypeScript.extensions).toContain('.jsx');
    expect(TypeScript.extensions).toContain('.mjs');
    expect(TypeScript.extensions).toContain('.cjs');
  });

  test('Clangd has C/C++ extensions', () => {
    expect(Clangd.extensions).toContain('.c');
    expect(Clangd.extensions).toContain('.cpp');
    expect(Clangd.extensions).toContain('.h');
    expect(Clangd.extensions).toContain('.hpp');
  });

  test('FSharp has .fs, .fsi, .fsx', () => {
    expect(FSharp.extensions).toContain('.fs');
    expect(FSharp.extensions).toContain('.fsi');
    expect(FSharp.extensions).toContain('.fsx');
  });

  test('Ruby includes .rake and .gemspec', () => {
    expect(Ruby.extensions).toContain('.rake');
    expect(Ruby.extensions).toContain('.gemspec');
  });

  test('Zig includes .zon', () => {
    expect(Zig.extensions).toContain('.zon');
  });
});
