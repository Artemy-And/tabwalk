import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';

// clears the users table, so it only runs against a database named for tests
const url = process.env.TABWALK_TEST_DATABASE_URL;
const skip = !url && 'set TABWALK_TEST_DATABASE_URL';

// A small OpenID Connect provider: discovery, keys and a token endpoint that checks PKCE and
// signs real RS256 ID tokens. The browser's trip to /authorize is played by the test itself.
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256', use: 'sig' };
const codes = new Map<string, { email: string; nonce: string; challenge: string }>();
let issuer = '';

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
function idToken(claims: Record<string, unknown>) {
  const body = `${b64({ alg: 'RS256', kid: 'test', typ: 'JWT' })}.${b64(claims)}`;
  return `${body}.${sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`;
}

const provider = new Hono()
  .get('/.well-known/openid-configuration', (c) =>
    c.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
    }),
  )
  .get('/jwks', (c) => c.json({ keys: [jwk] }))
  .post('/token', async (c) => {
    const form = await c.req.parseBody();
    const grant = codes.get(String(form.code));
    const challenge = createHash('sha256')
      .update(String(form.code_verifier ?? ''))
      .digest('base64url');
    if (!grant || challenge !== grant.challenge || form.client_secret !== 'shh') {
      return c.json({ error: 'invalid_grant' }, 400);
    }
    codes.delete(String(form.code));
    const now = Math.floor(Date.now() / 1000);
    return c.json({
      access_token: 'at',
      token_type: 'Bearer',
      expires_in: 300,
      id_token: idToken({
        iss: issuer,
        aud: 'tabwalk',
        sub: grant.email,
        email: grant.email,
        email_verified: true,
        name: grant.email.split('@')[0],
        nonce: grant.nonce,
        iat: now,
        exp: now + 300,
      }),
    });
  });

type App = typeof import('../api/app.js')['app'];
type Db = typeof import('../db/index.js');
let server: ReturnType<typeof serve>;
let app: App;
let db: Db['db'];
let pool: Db['pool'];
let users: typeof import('../db/schema.js')['users'];

before(async () => {
  if (!url) return;
  server = serve({ fetch: provider.fetch, port: 0 });
  await new Promise((resolve) => server.once('listening', resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(process.env, {
    DATABASE_URL: url,
    PUBLIC_URL: 'http://localhost:8080',
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: 'tabwalk',
    OIDC_CLIENT_SECRET: 'shh',
    OIDC_ALLOWED_DOMAINS: 'company.com',
  });
  ({ app } = await import('../api/app.js'));
  ({ db, pool } = await import('../db/index.js'));
  ({ users } = await import('../db/schema.js'));
  await db.delete(users);
});

after(async () => {
  if (!url) return;
  await db.delete(users);
  await pool.end();
  server.close();
});

const post = (path: string, body: unknown, cookie = '') =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
const get = (path: string, cookie = '') => app.request(path, { headers: { cookie } });
const cookieOf = (res: Response, name = 'tabwalk_session') =>
  res.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(';')[0] ?? '';

test('the dashboard API needs an account', { skip }, async () => {
  assert.equal((await get('/api/health')).status, 200);
  assert.equal((await get('/api/sites')).status, 401);
  assert.deepEqual(await (await get('/api/auth/config')).json(), {
    setup: true,
    sso: { label: 'Sign in with SSO' },
  });

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

  const again = await post('/api/auth/setup', { email: 'x@example.com', password: 'other one' });
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
});

// starts a sign-in, lets the provider approve it for `email` and returns the callback
async function ssoSignIn(email: string, tamper = false) {
  const start = await get('/api/auth/oidc/start');
  assert.equal(start.status, 302);
  const authorize = new URL(start.headers.get('location') ?? '');
  assert.equal(authorize.origin + authorize.pathname, `${issuer}/authorize`);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(
    authorize.searchParams.get('redirect_uri'),
    'http://localhost:8080/api/auth/oidc/callback',
  );
  const code = `code-${email}`;
  codes.set(code, {
    email,
    nonce: authorize.searchParams.get('nonce') ?? '',
    challenge: authorize.searchParams.get('code_challenge') ?? '',
  });
  const state = tamper ? 'forged' : authorize.searchParams.get('state');
  return get(
    `/api/auth/oidc/callback?code=${code}&state=${state}`,
    cookieOf(start, 'tabwalk_oidc'),
  );
}

test('single sign-on opens the account with the same email', { skip }, async () => {
  const res = await ssoSignIn('admin@example.com');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/');
  const me = await get('/api/auth/me', cookieOf(res));
  assert.equal(((await me.json()) as { email: string }).email, 'admin@example.com');
});

test('single sign-on adds people from allowed domains only', { skip }, async () => {
  const anna = await ssoSignIn('anna@company.com');
  assert.equal(anna.headers.get('location'), '/');
  assert.deepEqual(await (await get('/api/auth/me', cookieOf(anna))).json(), {
    email: 'anna@company.com',
    name: 'anna',
    hasPassword: false,
  });

  const mallory = await ssoSignIn('mallory@elsewhere.com');
  assert.match(mallory.headers.get('location') ?? '', /^\/\?sso_error=.*has%20no%20account/);
  assert.equal(cookieOf(mallory), '');
});

test('a callback whose state does not match is refused', { skip }, async () => {
  const res = await ssoSignIn('anna@company.com', true);
  assert.match(res.headers.get('location') ?? '', /^\/\?sso_error=/);
  assert.equal(cookieOf(res), '');
});
