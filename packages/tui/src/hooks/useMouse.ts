/**
 * useMouse Hook
 *
 * Basic mouse support for Ink TUI components.
 * Enables click detection for interactive elements.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useStdin, useStdout } from 'ink';

// ============================================
// Types
// ============================================

export interface MousePosition {
  x: number;
  y: number;
}

export interface MouseEvent {
  type: 'click' | 'doubleClick' | 'rightClick' | 'scroll';
  position: MousePosition;
  button: 'left' | 'right' | 'middle';
  timestamp: number;
}

export interface UseMouseOptions {
  /** Enable mouse tracking (default: true) */
  enabled?: boolean;
  /** Callback for mouse clicks */
  onClick?: (event: MouseEvent) => void;
  /** Callback for double clicks */
  onDoubleClick?: (event: MouseEvent) => void;
  /** Callback for right clicks */
  onRightClick?: (event: MouseEvent) => void;
  /** Double click threshold in ms (default: 300) */
  doubleClickThreshold?: number;
}

export interface UseMouseReturn {
  /** Current mouse position (if tracking) */
  position: MousePosition | null;
  /** Whether mouse is currently over the terminal */
  isActive: boolean;
  /** Last click position */
  lastClick: MousePosition | null;
}

// ============================================
// Mouse Protocol Constants
// ============================================

// Enable mouse tracking (SGR extended mode)
const ENABLE_MOUSE = '\x1b[?1000h\x1b[?1002h\x1b[?1006h';
// Disable mouse tracking
const DISABLE_MOUSE = '\x1b[?1000l\x1b[?1002l\x1b[?1006l';

// ============================================
// Hook
// ============================================

export function useMouse(options: UseMouseOptions = {}): UseMouseReturn {
  const {
    enabled = true,
    onClick,
    onDoubleClick,
    onRightClick,
    doubleClickThreshold = 300,
  } = options;

  const { stdin, setRawMode } = useStdin();
  const { stdout } = useStdout();

  const [position, setPosition] = useState<MousePosition | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [lastClick, setLastClick] = useState<MousePosition | null>(null);

  const lastClickTime = useRef<number>(0);
  const lastClickPos = useRef<MousePosition | null>(null);

  // Parse SGR mouse events: \x1b[<Cb;Cx;CyM or \x1b[<Cb;Cx;Cym
  const parseMouseEvent = useCallback((data: Buffer): MouseEvent | null => {
    const str = data.toString();

    // SGR extended mouse protocol: \x1b[<button;x;y[Mm]
    const sgrMatch = str.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (sgrMatch) {
      const buttonCode = parseInt(sgrMatch[1], 10);
      const x = parseInt(sgrMatch[2], 10) - 1; // Convert to 0-indexed
      const y = parseInt(sgrMatch[3], 10) - 1;
      const isRelease = sgrMatch[4] === 'm';

      // Only handle button releases (clicks)
      if (!isRelease) return null;

      const button: 'left' | 'right' | 'middle' =
        (buttonCode & 3) === 0 ? 'left' :
        (buttonCode & 3) === 1 ? 'middle' :
        (buttonCode & 3) === 2 ? 'right' : 'left';

      return {
        type: 'click',
        position: { x, y },
        button,
        timestamp: Date.now(),
      };
    }

    return null;
  }, []);

  // Handle mouse data
  const handleData = useCallback((data: Buffer) => {
    const event = parseMouseEvent(data);
    if (!event) return;

    setPosition(event.position);
    setLastClick(event.position);
    setIsActive(true);

    const now = event.timestamp;
    const timeSinceLastClick = now - lastClickTime.current;
    const samePosition = lastClickPos.current &&
      Math.abs(lastClickPos.current.x - event.position.x) <= 1 &&
      Math.abs(lastClickPos.current.y - event.position.y) <= 1;

    // Check for double click
    if (timeSinceLastClick < doubleClickThreshold && samePosition) {
      if (event.button === 'left' && onDoubleClick) {
        onDoubleClick({ ...event, type: 'doubleClick' });
      }
    } else {
      // Single click
      if (event.button === 'left' && onClick) {
        onClick(event);
      } else if (event.button === 'right' && onRightClick) {
        onRightClick(event);
      }
    }

    lastClickTime.current = now;
    lastClickPos.current = event.position;
  }, [parseMouseEvent, onClick, onDoubleClick, onRightClick, doubleClickThreshold]);

  // Enable/disable mouse tracking
  useEffect(() => {
    if (!enabled || !stdin || !stdout) return;

    // Enable raw mode for mouse input
    setRawMode(true);

    // Enable mouse tracking
    stdout.write(ENABLE_MOUSE);

    // Listen for mouse events
    stdin.on('data', handleData);

    return () => {
      // Disable mouse tracking
      stdout.write(DISABLE_MOUSE);
      stdin.off('data', handleData);
    };
  }, [enabled, stdin, stdout, setRawMode, handleData]);

  return {
    position,
    isActive,
    lastClick,
  };
}

// ============================================
// Clickable Area Hook
// ============================================

export interface ClickableArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useClickableArea(
  area: ClickableArea | null,
  onClick: () => void
): { isHovered: boolean } {
  const [isHovered, setIsHovered] = useState(false);

  const { position } = useMouse({
    enabled: !!area,
    onClick: (event) => {
      if (!area) return;

      const { x, y } = event.position;
      if (
        x >= area.x &&
        x < area.x + area.width &&
        y >= area.y &&
        y < area.y + area.height
      ) {
        onClick();
      }
    },
  });

  // Check if mouse is over the area
  useEffect(() => {
    if (!area || !position) {
      setIsHovered(false);
      return;
    }

    const { x, y } = position;
    const hovered =
      x >= area.x &&
      x < area.x + area.width &&
      y >= area.y &&
      y < area.y + area.height;

    setIsHovered(hovered);
  }, [area, position]);

  return { isHovered };
}
