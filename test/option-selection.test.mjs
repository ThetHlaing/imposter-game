import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chooseUnusedOption,
  updateUsedOptionIds
} from '../public/assets/option-selection.js';

const options = [
  { id: 'one', text: 'One' },
  { id: 'two', text: 'Two' },
  { id: 'three', text: 'Three' }
];

test('does not select an option already used in the current cycle', () => {
  const selected = chooseUnusedOption(options, ['one', 'two'], 'two', () => 0);

  assert.equal(selected.id, 'three');
});

test('starts a new cycle after every option has been used', () => {
  const selected = chooseUnusedOption(options, ['one', 'two', 'three'], 'three', () => 0);
  const nextUsedIds = updateUsedOptionIds(
    options,
    ['one', 'two', 'three'],
    selected.id
  );

  assert.equal(selected.id, 'one');
  assert.deepEqual(nextUsedIds, ['one']);
});

test('ignores history belonging to another category', () => {
  const selected = chooseUnusedOption(options, ['other-category-option'], null, () => 0);
  const nextUsedIds = updateUsedOptionIds(
    options,
    ['other-category-option'],
    selected.id
  );

  assert.equal(selected.id, 'one');
  assert.deepEqual(nextUsedIds, ['one']);
});

test('avoids an immediate repeat when beginning a new cycle', () => {
  const selected = chooseUnusedOption(options, ['one', 'two', 'three'], 'one', () => 0);

  assert.equal(selected.id, 'two');
});
