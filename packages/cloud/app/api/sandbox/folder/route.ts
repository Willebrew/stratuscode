import { NextRequest, NextResponse } from 'next/server';

const SIDECAR_URL = process.env.SANDBOX_API_URL || 'http://localhost:9000';

async function execInSandbox(
  containerId: string,
  command: string,
  timeout = 60000,
): Promise<{ exitCode: number; stdout: string; stderr: string } | null> {
  const res = await fetch(`${SIDECAR_URL}/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ containerId, command, cwd: '/workspace', timeout }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  const dirPath = req.nextUrl.searchParams.get('path');

  if (!sessionId || !dirPath) {
    return NextResponse.json(
      { error: 'sessionId and path are required' },
      { status: 400 },
    );
  }

  const containerId = `stratuscode-${sessionId}`;
  const folderName = dirPath.split('/').pop() || 'download';
  const parentDir = dirPath.substring(0, dirPath.lastIndexOf('/')) || '/';

  try {
    // Try zip first, fall back to tar+gz if zip not installed
    const zipCmd = `set -o pipefail && cd '${parentDir}' && zip -r -q - '${folderName}' | base64`;
    let result = await execInSandbox(containerId, zipCmd);

    if (!result) {
      return NextResponse.json({ error: 'Sandbox sidecar unreachable' }, { status: 502 });
    }

    if (result.exitCode === 0 && result.stdout.trim()) {
      const buffer = Buffer.from(result.stdout.trim(), 'base64');
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${folderName}.zip"`,
          'Content-Length': String(buffer.length),
        },
      });
    }

    // Fallback: tar+gz (always available)
    const tarCmd = `set -o pipefail && tar czf - -C '${parentDir}' '${folderName}' | base64`;
    result = await execInSandbox(containerId, tarCmd);

    if (!result) {
      return NextResponse.json({ error: 'Sandbox sidecar unreachable' }, { status: 502 });
    }

    if (result.exitCode !== 0 || !result.stdout.trim()) {
      return NextResponse.json(
        { error: result.stderr || 'Failed to archive folder' },
        { status: 404 },
      );
    }

    const buffer = Buffer.from(result.stdout.trim(), 'base64');
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${folderName}.tar.gz"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to download folder' },
      { status: 500 },
    );
  }
}
