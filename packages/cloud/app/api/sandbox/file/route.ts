import { NextRequest, NextResponse } from 'next/server';

const SIDECAR_URL = process.env.SANDBOX_API_URL || 'http://localhost:9000';

const MIME_TYPES: Record<string, string> = {
  '.ts': 'text/typescript', '.tsx': 'text/typescript', '.js': 'text/javascript', '.jsx': 'text/javascript',
  '.json': 'application/json', '.html': 'text/html', '.css': 'text/css',
  '.md': 'text/markdown', '.txt': 'text/plain', '.csv': 'text/csv',
  '.py': 'text/x-python', '.rs': 'text/x-rust', '.go': 'text/x-go',
  '.yaml': 'text/yaml', '.yml': 'text/yaml', '.toml': 'text/plain',
  '.sh': 'text/x-shellscript', '.bash': 'text/x-shellscript',
  '.xml': 'application/xml', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.zip': 'application/zip',
  '.tar': 'application/x-tar', '.gz': 'application/gzip',
  '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
};

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.bz2',
  '.pdf', '.mp3', '.mp4', '.wav',
  '.wasm', '.bin', '.exe',
]);

function getMimeType(path: string): string {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function isBinaryFile(path: string): boolean {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  const filePath = req.nextUrl.searchParams.get('path');

  if (!sessionId || !filePath) {
    return NextResponse.json(
      { error: 'sessionId and path are required' },
      { status: 400 },
    );
  }

  const containerId = `stratuscode-${sessionId}`;
  const binary = isBinaryFile(filePath);

  try {
    const command = binary
      ? `base64 '${filePath}'`
      : `cat '${filePath}'`;

    const res = await fetch(`${SIDECAR_URL}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ containerId, command, cwd: '/workspace', timeout: 15000 }),
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
        { error: result.stderr || 'File not found' },
        { status: 404 },
      );
    }

    const filename = filePath.split('/').pop() || 'download';
    const mimeType = getMimeType(filePath);

    if (binary) {
      const buffer = Buffer.from(result.stdout.trim(), 'base64');
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(buffer.length),
        },
      });
    }

    return new NextResponse(result.stdout, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to read file' },
      { status: 500 },
    );
  }
}
