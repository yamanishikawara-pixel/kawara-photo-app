import { test, expect } from 'vitest';
import { getProjectStorageKeys, hasProjectNameConflict, projectStorageKey } from './projectStorage.js';

test('getProjectStorageKeys only returns keys for the exact project name', () => {
  const storage = {
    [projectStorageKey('A', 'koujiName')]: '"A"',
    [projectStorageKey('A_B', 'koujiName')]: '"A_B"',
    [projectStorageKey('A', 'tileRows')]: '[]',
    cost_A_unknownField: '"ignore"',
  };

  expect(getProjectStorageKeys(storage, 'A').sort()).toEqual([
    projectStorageKey('A', 'koujiName'),
    projectStorageKey('A', 'tileRows'),
  ].sort());
});

test('hasProjectNameConflict only rejects the same project name', () => {
  expect(hasProjectNameConflict(['A'], 'A')).toBe(true);
  expect(hasProjectNameConflict(['A'], 'A_B')).toBe(false);
  expect(hasProjectNameConflict(['A'], 'A', 'A')).toBe(false);
});
