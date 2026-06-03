import test from 'node:test';
import assert from 'node:assert/strict';
import { getProjectStorageKeys, hasProjectNameConflict, projectStorageKey } from './projectStorage.js';

test('getProjectStorageKeys only returns keys for the exact project name', () => {
  const storage = {
    [projectStorageKey('A', 'koujiName')]: '"A"',
    [projectStorageKey('A_B', 'koujiName')]: '"A_B"',
    [projectStorageKey('A', 'tileRows')]: '[]',
    cost_A_unknownField: '"ignore"',
  };

  assert.deepEqual(getProjectStorageKeys(storage, 'A').sort(), [
    projectStorageKey('A', 'koujiName'),
    projectStorageKey('A', 'tileRows'),
  ].sort());
});

test('hasProjectNameConflict only rejects the same project name', () => {
  assert.equal(hasProjectNameConflict(['A'], 'A'), true);
  assert.equal(hasProjectNameConflict(['A'], 'A_B'), false);
  assert.equal(hasProjectNameConflict(['A'], 'A', 'A'), false);
});
