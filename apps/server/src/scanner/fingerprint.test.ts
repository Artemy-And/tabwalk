import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fingerprint } from './fingerprint.js';

const close =
  '<button class="icon-btn"><svg viewBox="0 0 24 24" class="lucide lucide-x"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button>';
const menu =
  '<button class="icon-btn"><svg viewBox="0 0 24 24" class="lucide lucide-menu"><line x1="4" x2="20" y1="12" y2="12"></line></svg></button>';

test('icon buttons that differ only by glyph share a fingerprint', () => {
  assert.equal(fingerprint('button-name', close), fingerprint('button-name', menu));
});

test('a truncated svg opening tag is normalized too', () => {
  assert.equal(
    fingerprint('svg-img-alt', '<svg role="img" class="lucide lucide-x" viewBox="0 0 24 24" ...>'),
    fingerprint(
      'svg-img-alt',
      '<svg role="img" class="lucide lucide-menu" viewBox="0 0 24 24" ...>',
    ),
  );
});

test('different buttons still get different fingerprints', () => {
  assert.notEqual(
    fingerprint('button-name', close),
    fingerprint('button-name', '<button class="icon-btn" type="submit"><svg></svg></button>'),
  );
});

test('the rule id is part of the fingerprint', () => {
  assert.notEqual(fingerprint('button-name', close), fingerprint('link-name', close));
});
