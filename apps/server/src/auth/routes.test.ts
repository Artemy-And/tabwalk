import assert from 'node:assert/strict';
import { test } from 'node:test';

// clears the users table, so it only runs against a database named for tests
const url = process.env.TABWALK_TEST_DATABASE_URL;

test('the dashboard API needs an account', {
  skip: !url && 'set TABWALK_TEST_DATABASE_URL',
}, async () => {
  process.env.DATABASE_URL = url;
  const { app } = await import('../api/app.js');
  const { db, pool } = await import('../db/index.js');
  const { users } = await import('../db/schema.js');
  await db.delete(users);

  const post = (path: string, body: unknown, cookie = '') =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    });
  const get = (path: string, cookie = '') => app.request(path, { headers: { cookie } });
  const cookieOf = (res: Response) => res.headers.get('set-cookie')?.split(';')[0] ?? '';

  try {
    assert.equal((await get('/api/health')).status, 200);
    assert.equal((await get('/api/sites')).status, 401);
    assert.deepEqual(await (await get('/api/auth/config')).json(), { setup: true, sso: null });

    const short = await post('/api/auth/setup', { email: 'admin@example.com', password: 'short' });
    assert.equal(short.status, 400);
    assert.deepEqual(await short.json(), { error: 'Use at least 8 characters' });

    const setup = await post('/api/auth/setup', {
      email: 'Admin@Example.com',
      password: 'first password',
    });
    assert.equal(setup.status, 201);
    const cookie = cookieOf(setup);
    assert.match(setup.headers.get('set-cookie') ?? '', /HttpOnly.*SameSite=Lax/i);
    assert.equal((await get('/api/sites', cookie)).status, 200);
    assert.deepEqual(await (await get('/api/auth/me', cookie)).json(), {
      email: 'admin@example.com',
      name: null,
      hasPassword: true,
    });

    const again = await post('/api/auth/setup', {
      email: 'x@example.com',
      password: 'other password',
    });
    assert.equal(again.status, 409);

    await post('/api/auth/logout', {}, cookie);
    assert.equal((await get('/api/sites', cookie)).status, 401);

    const wrong = await post('/api/auth/login', {
      email: 'admin@example.com',
      password: 'nope nope',
    });
    assert.equal(wrong.status, 401);
    const login = await post('/api/auth/login', {
      email: ' ADMIN@example.com ',
      password: 'first password',
    });
    assert.equal(login.status, 200);
    const fresh = cookieOf(login);

    const change = await post(
      '/api/auth/password',
      { current: 'first password', password: 'second password' },
      fresh,
    );
    assert.equal(change.status, 200);
    assert.equal((await get('/api/sites', fresh)).status, 401);
    assert.equal((await get('/api/sites', cookieOf(change))).status, 200);
  } finally {
    await db.delete(users);
    await pool.end();
  }
});
