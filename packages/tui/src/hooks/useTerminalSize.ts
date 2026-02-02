/**
 * useTerminalSize Hook
 *
 * Tracks terminal dimensions and provides min-size warnings.
 */

import { useState, useEffect } from 'react';
import { useStdout } from 'ink';

export interface TerminalSize {
  columns: number;
  rows: number;
  isTooSmall: boolean;
}

const MIN_COLUMNS = 40;
const MIN_ROWS = 10;

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  
  const [size, setSize] = useState<TerminalSize>(() => ({
    columns: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
    isTooSmall: (stdout?.columns ?? 80) < MIN_COLUMNS || (stdout?.rows ?? 24) < MIN_ROWS,
  }));

  useEffect(() => {
    if (!stdout) return;

    const handleResize = () => {
      const columns = stdout.columns ?? 80;
      const rows = stdout.rows ?? 24;
      setSize({
        columns,
        rows,
        isTooSmall: columns < MIN_COLUMNS || rows < MIN_ROWS,
      });
    };

    stdout.on('resize', handleResize);
    handleResize(); // Initial call

    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  return size;
}
