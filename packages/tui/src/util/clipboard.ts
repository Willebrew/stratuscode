/**
 * Clipboard utility for reading image data from the system clipboard.
 * Supports macOS, Linux (Wayland + X11), and Windows/WSL.
 */

import { spawnSync } from 'child_process';

export interface ClipboardImage {
  data: string; // base64-encoded image data
  mime: string; // e.g. "image/png"
}

/**
 * Attempt to read an image from the system clipboard.
 * Returns null if no image is available or the platform is unsupported.
 */
export function readClipboardImage(): ClipboardImage | null {
  try {
    if (process.platform === 'darwin') {
      return readMacOS();
    }
    if (process.platform === 'linux') {
      return readLinux();
    }
    if (process.platform === 'win32') {
      return readWindows();
    }
    return null;
  } catch {
    return null;
  }
}

function readMacOS(): ClipboardImage | null {
  // Use Swift to read clipboard image — osascript has issues with NSBitmapImageRep constants
  const swift = `
import AppKit
let pb = NSPasteboard.general
guard let data = pb.data(forType: .png) ?? pb.data(forType: .tiff) else {
    print("NONE")
    exit(0)
}
guard let rep = NSBitmapImageRep(data: data),
      let pngData = rep.representation(using: .png, properties: [:]) else {
    print("NONE")
    exit(0)
}
print(pngData.base64EncodedString())
`;

  const result = spawnSync('swift', ['-e', swift], {
    timeout: 10000,
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024, // 50MB for large images
  });

  if (result.status !== 0 || !result.stdout) return null;

  const output = result.stdout.trim();
  if (output === 'NONE' || output.length < 100) return null;

  return { data: output, mime: 'image/png' };
}

function readLinux(): ClipboardImage | null {
  // Try Wayland first (wl-paste), then X11 (xclip)
  const wayland = spawnSync('wl-paste', ['-t', 'image/png'], {
    timeout: 3000,
    maxBuffer: 50 * 1024 * 1024,
  });

  if (wayland.status === 0 && wayland.stdout && wayland.stdout.length > 100) {
    const base64 = Buffer.from(wayland.stdout).toString('base64');
    return { data: base64, mime: 'image/png' };
  }

  const xclip = spawnSync('xclip', ['-selection', 'clipboard', '-t', 'image/png', '-o'], {
    timeout: 3000,
    maxBuffer: 50 * 1024 * 1024,
  });

  if (xclip.status === 0 && xclip.stdout && xclip.stdout.length > 100) {
    const base64 = Buffer.from(xclip.stdout).toString('base64');
    return { data: base64, mime: 'image/png' };
  }

  return null;
}

function readWindows(): ClipboardImage | null {
  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    $img = [System.Windows.Forms.Clipboard]::GetImage()
    if ($img -eq $null) { Write-Output "NONE"; exit }
    $ms = New-Object System.IO.MemoryStream
    $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    [Convert]::ToBase64String($ms.ToArray())
  `;

  const result = spawnSync('powershell', ['-NoProfile', '-Command', psScript], {
    timeout: 5000,
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  });

  if (result.status !== 0 || !result.stdout) return null;

  const output = result.stdout.trim();
  if (output === 'NONE' || output.length < 100) return null;

  return { data: output, mime: 'image/png' };
}
