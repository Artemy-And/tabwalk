import * as client from 'openid-client';
import { env } from '../env.js';

export interface OidcChecks {
  verifier: string;
  state: string;
  nonce: string;
}

// Google Workspace, Microsoft Entra ID, Keycloak or any other OpenID Connect provider
export class Oidc {
  readonly label: string;
  #config: Promise<client.Configuration> | null = null;

  constructor(
    private readonly issuer: string,
    private readonly clientId: string,
    private readonly clientSecret: string | undefined,
    private readonly publicUrl: string,
    label: string | undefined,
  ) {
    this.label = label ?? 'Sign in with SSO';
  }

  static fromEnv(): Oidc | null {
    if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID || !env.PUBLIC_URL) return null;
    return new Oidc(
      env.OIDC_ISSUER,
      env.OIDC_CLIENT_ID,
      env.OIDC_CLIENT_SECRET,
      env.PUBLIC_URL,
      env.OIDC_LABEL,
    );
  }

  #callbackUrl(): URL {
    return new URL('/api/auth/oidc/callback', this.publicUrl);
  }

  #discover(): Promise<client.Configuration> {
    const issuer = new URL(this.issuer);
    // an http:// issuer is a provider inside the network, chosen on purpose
    const insecure = issuer.protocol === 'http:';
    this.#config ??= client
      .discovery(
        issuer,
        this.clientId,
        this.clientSecret,
        undefined,
        insecure ? { execute: [client.allowInsecureRequests] } : undefined,
      )
      .catch((error: unknown) => {
        this.#config = null;
        throw error;
      });
    return this.#config;
  }

  async start(): Promise<{ url: string; checks: OidcChecks }> {
    const config = await this.#discover();
    const checks: OidcChecks = {
      verifier: client.randomPKCECodeVerifier(),
      state: client.randomState(),
      nonce: client.randomNonce(),
    };
    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: this.#callbackUrl().toString(),
      scope: 'openid email profile',
      code_challenge: await client.calculatePKCECodeChallenge(checks.verifier),
      code_challenge_method: 'S256',
      state: checks.state,
      nonce: checks.nonce,
    });
    return { url: url.toString(), checks };
  }

  async finish(
    search: string,
    checks: OidcChecks,
  ): Promise<{ email: string; name: string | null }> {
    const config = await this.#discover();
    // rebuilt from PUBLIC_URL so a reverse proxy does not change redirect_uri
    const current = this.#callbackUrl();
    current.search = search;
    const tokens = await client.authorizationCodeGrant(config, current, {
      pkceCodeVerifier: checks.verifier,
      expectedState: checks.state,
      expectedNonce: checks.nonce,
    });
    const claims = tokens.claims();
    const email = (claims?.email ?? claims?.preferred_username) as string | undefined;
    if (!email || claims?.email_verified === false) {
      throw new Error('Your identity provider did not share a verified email address');
    }
    return { email: email.toLowerCase(), name: (claims?.name as string | undefined) ?? null };
  }
}
