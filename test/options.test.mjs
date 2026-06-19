import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  expandedOptionCounts,
  expandedQuestions,
  expandedWords
} from '../public/assets/expanded-options.js';
import { onlineImages } from '../public/assets/online-images.js';

const categoryIds = [
  'animals',
  'foods',
  'locations',
  'countries',
  'movies',
  'jobs',
  'technologies',
  'imaginations',
  'supes',
  'nature',
  'histories',
  'sports'
];

test('adds 100 word and question options to every category', () => {
  for (const categoryId of categoryIds) {
    assert.equal(expandedOptionCounts[categoryId], 100);
    assert.equal(
      expandedQuestions.filter((option) => option.categoryId === categoryId).length,
      100
    );
  }

  assert.equal(expandedWords.length, 1200);
  assert.equal(expandedQuestions.length, 1200);
});

test('expanded options are complete and unique within each category', () => {
  for (const categoryId of categoryIds) {
    const words = expandedWords.filter((option) => option.categoryId === categoryId);
    const questions = expandedQuestions.filter((option) => option.categoryId === categoryId);

    assert.equal(new Set(words.map((option) => option.text)).size, 100);
    assert.equal(new Set(questions.map((option) => option.text)).size, 100);
    assert.ok(
      words.every(
        (option) =>
          (option.imageId === null ||
            option.imageId.startsWith('/assets/options/') ||
            option.imageId.startsWith('https://upload.wikimedia.org/')) &&
          option.hint
      )
    );
    assert.ok(questions.every((option) => option.text && option.hint));
  }
});

test('online image matches include attribution and preserve text fallbacks', async () => {
  const attributions = JSON.parse(
    await readFile(
      new URL('../public/assets/online-image-attribution.json', import.meta.url),
      'utf8'
    )
  );
  const wordsWithImages = expandedWords.filter((option) => option.imageId);
  const wordsWithoutImages = expandedWords.filter((option) => !option.imageId);

  assert.ok(Object.keys(onlineImages).length >= 400);
  assert.equal(Object.keys(onlineImages).length, Object.keys(attributions).length);
  assert.equal(wordsWithImages.length, Object.keys(onlineImages).length);
  assert.ok(wordsWithoutImages.length > 0);

  for (const [key, image] of Object.entries(onlineImages)) {
    assert.match(image.path, /^https:\/\/upload\.wikimedia\.org\//);
    assert.match(image.sourcePage, /^https:\/\/commons\.wikimedia\.org\//);
    assert.equal(attributions[key].sourcePage, image.sourcePage);
  }
});
