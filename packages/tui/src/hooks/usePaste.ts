/**
 * usePaste Hook
 *
 * Detects bracketed paste mode sequences at the raw stdin level (before Ink
 * parses them). Exposes a `pasteActive` ref that UnifiedInput reads to know
 * whether incoming characters belong to a paste.
 *
 * Also enables bracketed paste mode on mount so the terminal wraps pastes
 * in \x1b[200~ … \x1b[201~ markers.
 */

import { useEffect, useRef } from 'react';
import { useStdin } from 'ink';

export { readClipboardImage } from '../util/clipboard';
export type { ClipboardImage } from '../util/clipboard';

export interface UsePasteReturn {
  /** true while inside a bracketed paste sequence */
  pasteActiveRef: React.RefObject<boolean>;
}

export interface UsePasteOptions {
  active?: boolean;
  /** Called when a paste sequence starts */
  onPasteStart?: () => void;
  /** Called when a paste sequence ends */
  onPasteEnd?: () => void;
}

export function usePaste({ active = true, onPasteStart, onPasteEnd }: UsePasteOptions): UsePasteReturn {
  const { stdin } = useStdin();
  const pasteActiveRef = useRef(false);
  const onPasteStartRef = useRef(onPasteStart);
  const onPasteEndRef = useRef(onPasteEnd);
  onPasteStartRef.current = onPasteStart;
  onPasteEndRef.current = onPasteEnd;

  // Enable bracketed paste mode
  useEffect(() => {
    if (!active) return;
    process.stdout.write('\x1b[?2004h');
    return () => {
      process.stdout.write('\x1b[?2004l');
    };
  }, [active]);

  // Listen on raw stdin for bracketed paste markers BEFORE Ink sees the data.
  // The markers are \x1b[200~ (start) and \x1b[201~ (end).
  // Ink's input parser will strip the \x1b[ prefix but we detect them here first.
  useEffect(() => {
    if (!active || !stdin) return;

    // We need to detect the markers in the raw byte stream.
    const START_SEQ = Buffer.from('\x1b[200~');
    const END_SEQ = Buffer.from('\x1b[201~');

    const handleData = (data: Buffer) => {
      // Check for start marker
      if (data.includes(START_SEQ)) {
        if (!pasteActiveRef.current) {
          pasteActiveRef.current = true;
          onPasteStartRef.current?.();
        }
      }
      // Check for end marker
      if (data.includes(END_SEQ)) {
        if (pasteActiveRef.current) {
          // Use setTimeout(0) so the current useInput calls from this chunk
          // still see pasteActive=true, and we flip it off after.
          setTimeout(() => {
            pasteActiveRef.current = false;
            onPasteEndRef.current?.();
          }, 0);
        }
      }
    };

    // Prepend our listener so it fires before Ink's
    stdin.prependListener('data', handleData);
    return () => {
      stdin.removeListener('data', handleData);
    };
  }, [active, stdin]);

  return { pasteActiveRef };
}
