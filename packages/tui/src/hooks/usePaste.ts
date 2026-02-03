/**
 * usePaste Hook
 *
 * Intercepts stdin.emit to capture paste data BEFORE Ink's useInput sees it.
 * This prevents double-processing of pasted text.
 *
 * Handles:
 * - Bracketed paste mode sequences (\x1b[200~ ... \x1b[201~)
 * - Heuristic fallback (large data chunks = paste)
 * - Ctrl+V (\x16) for clipboard image reading
 */

import { useEffect, useRef } from 'react';
import { useStdin } from 'ink';
import { readClipboardImage } from '../util/clipboard';

// Bracketed paste mode escape sequences
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';
const CTRL_V = '\x16';

// Thresholds for "large paste" summary
const LINE_THRESHOLD = 3;
const CHAR_THRESHOLD = 150;

export interface TextPasteEvent {
  type: 'text';
  text: string;
  lineCount: number;
  isLarge: boolean;
}

export interface ImagePasteEvent {
  type: 'image';
  data: string; // base64
  mime: string;
}

export type PasteEvent = TextPasteEvent | ImagePasteEvent;

export interface UsePasteOptions {
  /** Called when a paste is detected */
  onPaste: (event: PasteEvent) => void;
  /** Whether paste detection is active */
  active?: boolean;
}

export function usePaste({ onPaste, active = true }: UsePasteOptions) {
  const { stdin } = useStdin();
  const onPasteRef = useRef(onPaste);
  onPasteRef.current = onPaste;
  const bracketedBufferRef = useRef<string | null>(null);
  const origEmitRef = useRef<typeof stdin.emit | null>(null);

  useEffect(() => {
    if (!active || !stdin) return;

    // Save original emit — only once (guard against double-patching on re-renders)
    const origEmit = origEmitRef.current ?? stdin.emit.bind(stdin);
    origEmitRef.current = origEmit;

    const handlePastedText = (raw: string) => {
      const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lineCount = text.split('\n').length;
      const isLarge = lineCount >= LINE_THRESHOLD || text.length >= CHAR_THRESHOLD;

      if (isLarge) {
        onPasteRef.current({ type: 'text', text, lineCount, isLarge });
      } else {
        // Small paste — re-emit so Ink's useInput processes it normally
        origEmit.call(stdin, 'data', Buffer.from(text, 'utf-8'));
      }
    };

    const tryImagePaste = (): boolean => {
      const image = readClipboardImage();
      if (image) {
        onPasteRef.current({ type: 'image', data: image.data, mime: image.mime });
        return true;
      }
      return false;
    };

    // Monkey-patch stdin.emit to intercept 'data' events before Ink sees them
    stdin.emit = function patchedEmit(event: string | symbol, ...args: any[]): boolean {
      if (event !== 'data') {
        return origEmit.call(stdin, event, ...args);
      }

      const buf = args[0];
      const str: string = typeof buf === 'string'
        ? buf
        : Buffer.isBuffer(buf)
          ? buf.toString('utf-8')
          : String(buf);

      // --- Ctrl+V: check clipboard for image ---
      if (str === CTRL_V) {
        if (tryImagePaste()) {
          return true; // swallowed — don't pass to Ink
        }
        // No image in clipboard — pass through so terminal paste can work
        return origEmit.call(stdin, event, ...args);
      }

      // --- Bracketed paste: start sequence detected ---
      if (str.includes(PASTE_START)) {
        // Any data before the paste start should pass through to Ink
        const pasteStartIdx = str.indexOf(PASTE_START);
        const before = str.slice(0, pasteStartIdx);
        if (before.length > 0) {
          origEmit.call(stdin, 'data', Buffer.from(before, 'utf-8'));
        }

        const contentStart = pasteStartIdx + PASTE_START.length;
        const endIdx = str.indexOf(PASTE_END, contentStart);

        if (endIdx !== -1) {
          // Complete paste in a single chunk
          handlePastedText(str.slice(contentStart, endIdx));

          // Any data after paste end should pass through to Ink
          const after = str.slice(endIdx + PASTE_END.length);
          if (after.length > 0) {
            origEmit.call(stdin, 'data', Buffer.from(after, 'utf-8'));
          }
        } else {
          // Paste spans multiple chunks — start buffering
          bracketedBufferRef.current = str.slice(contentStart);
        }
        return true;
      }

      // --- Continue buffering a multi-chunk bracketed paste ---
      if (bracketedBufferRef.current !== null) {
        const endIdx = str.indexOf(PASTE_END);
        if (endIdx !== -1) {
          bracketedBufferRef.current += str.slice(0, endIdx);
          handlePastedText(bracketedBufferRef.current);
          bracketedBufferRef.current = null;

          const after = str.slice(endIdx + PASTE_END.length);
          if (after.length > 0) {
            origEmit.call(stdin, 'data', Buffer.from(after, 'utf-8'));
          }
        } else {
          bracketedBufferRef.current += str;
        }
        return true;
      }

      // --- Heuristic fallback: large chunk without bracketed paste ---
      const newlineCount = (str.match(/\n/g) || []).length;
      if (str.length >= CHAR_THRESHOLD || newlineCount >= LINE_THRESHOLD) {
        handlePastedText(str);
        return true;
      }

      // Normal input — pass through to Ink
      return origEmit.call(stdin, event, ...args);
    } as typeof stdin.emit;

    return () => {
      // Restore original emit on cleanup
      if (origEmitRef.current) {
        stdin.emit = origEmitRef.current as typeof stdin.emit;
      }
      origEmitRef.current = null;
      bracketedBufferRef.current = null;
    };
  }, [active, stdin]);
}
