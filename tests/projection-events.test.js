import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceEventIdOrNull } from '../apps/backend/src/store.js';

test('manual draft event ids are not stored as UUID source references', () => {
  assert.equal(sourceEventIdOrNull('draft-5ae69c35-3248-4dd7-a86a-275144a9f9c6'), null);
  assert.equal(sourceEventIdOrNull('5ae69c35-3248-4dd7-a86a-275144a9f9c6'), '5ae69c35-3248-4dd7-a86a-275144a9f9c6');
});
