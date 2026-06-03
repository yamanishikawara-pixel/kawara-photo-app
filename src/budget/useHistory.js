import { useState, useCallback } from 'react';

export function useHistory(max = 20) {
  const [stack, setStack] = useState([]);

  const push = useCallback((label, apply) => {
    setStack(s => [...s.slice(-(max - 1)), { label, apply, ts: Date.now() }]);
  }, [max]);

  const undo = useCallback(() => {
    setStack(s => {
      if (s.length === 0) return s;
      const last = s[s.length - 1];
      last.apply();
      return s.slice(0, -1);
    });
  }, []);

  const clear = useCallback(() => setStack([]), []);

  return {
    push,
    undo,
    clear,
    canUndo: stack.length > 0,
    lastLabel: stack.length > 0 ? stack[stack.length - 1].label : null,
  };
}
