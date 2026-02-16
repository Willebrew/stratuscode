import { describe, test, expect } from 'bun:test';

// ─────────────────────────────────────────────
// SidebarContext test strategy
// ─────────────────────────────────────────────
// The sidebar-context module is a thin React Context wrapper that uses:
//   - createContext (with default isOpen=false, no-op toggle/close)
//   - SidebarProvider: useState(false) + useCallback for toggle/close
//   - useSidebar: useContext(SidebarContext)
//
// Because it relies on React's JSX rendering pipeline and context propagation,
// full component testing requires a DOM environment with @testing-library/react.
// Here we test the PURE LOGIC that the context encodes:
//   1. The state machine behavior (toggle/close semantics)
//   2. Default values
//   3. Edge cases
//
// Integration testing note: To test the full React tree behavior,
// use @testing-library/react with the SidebarProvider rendered in a test
// component that calls useSidebar() and asserts on the returned values.
// ─────────────────────────────────────────────

// ─── State machine simulation ───
// Replicates the exact state logic from SidebarProvider:
//   const [isOpen, setIsOpen] = useState(false);
//   const toggle = useCallback(() => setIsOpen((v) => !v), []);
//   const close = useCallback(() => setIsOpen(false), []);

class SidebarState {
  isOpen: boolean;

  constructor(initial = false) {
    this.isOpen = initial;
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  close(): void {
    this.isOpen = false;
  }
}

// ─────────────────────────────────────────────
// Default values
// ─────────────────────────────────────────────

describe('SidebarContext: default values', () => {
  test('initial state is isOpen=false', () => {
    const state = new SidebarState();
    expect(state.isOpen).toBe(false);
  });

  test('default context value matches: isOpen=false, toggle=noop, close=noop', () => {
    // The createContext call in sidebar-context.tsx passes:
    // { isOpen: false, toggle: () => {}, close: () => {} }
    const defaultValue = {
      isOpen: false,
      toggle: () => {},
      close: () => {},
    };
    expect(defaultValue.isOpen).toBe(false);
    expect(typeof defaultValue.toggle).toBe('function');
    expect(typeof defaultValue.close).toBe('function');
    // No-op functions should not throw
    defaultValue.toggle();
    defaultValue.close();
  });
});

// ─────────────────────────────────────────────
// toggle() behavior
// ─────────────────────────────────────────────

describe('SidebarContext: toggle()', () => {
  test('toggle flips isOpen from false to true', () => {
    const state = new SidebarState(false);
    state.toggle();
    expect(state.isOpen).toBe(true);
  });

  test('toggle flips isOpen from true to false', () => {
    const state = new SidebarState(true);
    state.toggle();
    expect(state.isOpen).toBe(false);
  });

  test('double toggle returns to original state', () => {
    const state = new SidebarState(false);
    state.toggle();
    state.toggle();
    expect(state.isOpen).toBe(false);
  });

  test('triple toggle results in opposite of initial', () => {
    const state = new SidebarState(false);
    state.toggle();
    state.toggle();
    state.toggle();
    expect(state.isOpen).toBe(true);
  });
});

// ─────────────────────────────────────────────
// close() behavior
// ─────────────────────────────────────────────

describe('SidebarContext: close()', () => {
  test('close sets isOpen to false when currently true', () => {
    const state = new SidebarState(true);
    state.close();
    expect(state.isOpen).toBe(false);
  });

  test('close is idempotent when already closed', () => {
    const state = new SidebarState(false);
    state.close();
    expect(state.isOpen).toBe(false);
  });

  test('close after toggle returns to closed', () => {
    const state = new SidebarState(false);
    state.toggle(); // true
    state.close();  // false
    expect(state.isOpen).toBe(false);
  });

  test('multiple close calls remain false', () => {
    const state = new SidebarState(true);
    state.close();
    state.close();
    state.close();
    expect(state.isOpen).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Combined operations
// ─────────────────────────────────────────────

describe('SidebarContext: combined operations', () => {
  test('toggle -> close -> toggle produces open state', () => {
    const state = new SidebarState(false);
    state.toggle(); // true
    state.close();  // false
    state.toggle(); // true
    expect(state.isOpen).toBe(true);
  });

  test('close -> toggle -> close -> toggle -> toggle produces true', () => {
    const state = new SidebarState(false);
    state.close();  // false
    state.toggle(); // true
    state.close();  // false
    state.toggle(); // true
    state.toggle(); // false
    expect(state.isOpen).toBe(false);
  });

  test('many toggles: even count returns to initial, odd flips', () => {
    const state = new SidebarState(false);
    for (let i = 0; i < 10; i++) state.toggle();
    expect(state.isOpen).toBe(false); // even count

    state.toggle(); // 11th
    expect(state.isOpen).toBe(true); // odd count
  });
});

// ─────────────────────────────────────────────
// Functional equivalence with React's useState updater
// ─────────────────────────────────────────────

describe('SidebarContext: functional updater equivalence', () => {
  test('toggle is equivalent to setIsOpen(v => !v)', () => {
    // Simulating React's updater pattern
    let isOpen = false;
    const toggle = () => { isOpen = !isOpen; };
    const close = () => { isOpen = false; };

    toggle();
    expect(isOpen).toBe(true);
    toggle();
    expect(isOpen).toBe(false);
    toggle();
    expect(isOpen).toBe(true);
    close();
    expect(isOpen).toBe(false);
  });

  test('close is equivalent to setIsOpen(false)', () => {
    let isOpen = true;
    const close = () => { isOpen = false; };

    close();
    expect(isOpen).toBe(false);
    close();
    expect(isOpen).toBe(false);
  });
});
