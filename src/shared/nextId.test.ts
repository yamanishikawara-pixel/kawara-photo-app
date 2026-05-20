import { describe, it, expect } from 'vitest';
import { nextId } from './utils';

describe('nextId', () => {
  it('returns a positive number', () => {
    expect(nextId()).toBeGreaterThan(0);
  });

  it('strictly increases on each call', () => {
    const ids = Array.from({ length: 100 }, () => nextId());
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBeGreaterThan(ids[i - 1]);
    }
  });

  it('never returns duplicates within a session (1000 calls)', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => nextId()));
    expect(ids.size).toBe(1000);
  });
});
