/**
 * useCenteredPadding Hook
 *
 * Computes a numeric gutter for centering content at a max column width.
 * Unlike CenteredLayout (flex-row gutters), this returns a padding value
 * that can be applied to ANY element — including Ink's Static items.
 */

import { useState, useEffect, useRef } from 'react';
import { useStdout } from 'ink';

export interface CenteredPadding {
  gutter: number;
  contentWidth: number;
}

export function useCenteredPadding(maxWidth = 100): CenteredPadding {
  const { stdout } = useStdout();

  const compute = (): CenteredPadding => {
    const columns = stdout?.columns ?? 120;
    if (columns <= maxWidth) {
      return { gutter: 0, contentWidth: columns };
    }
    const gutter = Math.floor((columns - maxWidth) / 2);
    return { gutter, contentWidth: maxWidth };
  };

  const [padding, setPadding] = useState<CenteredPadding>(compute);
  const initializedRef = useRef(false);
  // Counter that forces a re-render after screen clear, ensuring Ink repaints
  const [, setRenderTick] = useState(0);

  useEffect(() => {
    if (!stdout) return;

    const handleResize = () => {
      // Clear the terminal on resize so Ink re-paints all content
      // with the new gutter. Without this, scrollback content retains
      // its old padding and looks misaligned.
      if (initializedRef.current) {
        stdout.write('\x1b[2J\x1b[H');
      }
      initializedRef.current = true;

      setPadding(compute());
      // Force Ink to repaint even if gutter value didn't change
      setRenderTick(t => t + 1);
    };

    stdout.on('resize', handleResize);
    handleResize();

    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  return padding;
}
