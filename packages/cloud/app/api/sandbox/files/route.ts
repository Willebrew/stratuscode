import { NextRequest, NextResponse } from 'next/server';

const SIDECAR_URL = process.env.SANDBOX_API_URL || 'http://localhost:9000';

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  const dirPath = req.nextUrl.searchParams.get('path') || '/workspace';

  if (!sessionId) {
    return NextResponse.json(
      { error: 'sessionId is required' },
      { status: 400 },
    );
  }

  const containerId = `stratuscode-${sessionId}`;

  try {
    const command = `find '${dirPath}' -maxdepth 1 -not -name '.' -not -path '${dirPath}' -printf '%y|%s|%p\\n' 2>/dev/null | sort -t'|' -k3`;

    const res = await fetch(`${SIDECAR_URL}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ containerId, command, cwd: '/workspace', timeout: 10000 }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Sandbox sidecar unreachable' },
        { status: 502 },
      );
    }

    const result = await res.json() as { exitCode: number; stdout: string; stderr: string };

    if (result.exitCode !== 0) {
      return NextResponse.json(
        { error: result.stderr || 'Directory not found' },
        { status: 404 },
      );
    }

    const files: FileEntry[] = result.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line: string) => {
        const [typeChar, sizeStr, ...pathParts] = line.split('|');
        const fullPath = pathParts.join('|');
        return {
          name: fullPath.split('/').pop() || fullPath,
          path: fullPath,
          type: typeChar === 'd' ? 'directory' as const : 'file' as const,
          size: parseInt(sizeStr || '0', 10),
        };
      })
      .sort((a: FileEntry, b: FileEntry) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    return NextResponse.json({ path: dirPath, files });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to list directory' },
      { status: 500 },
    );
  }
}
