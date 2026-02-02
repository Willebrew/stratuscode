/**
 * useCenteredPadding Hook
 *
 * Computes a numeric gutter for centering content at a max column width.
 * Unlike CenteredLayout (flex-row gutters), this returns a padding value
 * that can be applied to ANY element — including Ink's Static items.
 */

import { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (!stdout) return;

    const handleResize = () => {
      setPadding(compute());
    };

    stdout.on('resize', handleResize);
    handleResize();

    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  return padding;
}
