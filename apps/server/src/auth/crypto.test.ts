import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, randomToken, sha256, verifyPassword } from './crypto.js';

test('a password checks against its own hash only', async () => {
  const stored = await hashPassword('correct horse battery');
  assert.match(stored, /^scrypt\$/);
  assert.equal(await verifyPassword('correct horse battery', stored), true);
  assert.equal(await verifyPassword('correct horse', stored), false);
});

test('the same password hashes differently each time', async () => {
  assert.notEqual(await hashPassword('same password'), await hashPassword('same password'));
});

test('a malformed hash never verifies', async () => {
  assert.equal(await verifyPassword('anything', 'plain-text'), false);
  assert.equal(await verifyPassword('anything', 'bcrypt$a$b'), false);
});

test('tokens are long and random, and sessions store their hash', () => {
  const token = randomToken();
  assert.ok(token.length >= 40);
  assert.notEqual(token, randomToken());
  assert.match(sha256(token), /^[0-9a-f]{64}$/);
});
