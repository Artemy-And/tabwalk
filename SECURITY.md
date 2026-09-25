# Security Policy

## Supported versions

Security fixes go into the latest release only. Please update before reporting.

## Reporting a vulnerability

Do not open a public issue.

Use GitHub's private reporting instead: **Security → Report a vulnerability** on
this repository. Include the version, steps to reproduce and what an attacker
could do with it.

You will get a reply within 7 days. Once a fix is released, the advisory is
published and reporters are credited unless they ask not to be.

## Scope

In scope:

- the API and the web UI
- the scanner (for example SSRF through a scanned URL or a sitemap)
- the published Docker images and `docker-compose.yml`

Out of scope: findings in sites that Tabwalk scans, and issues that need an
already compromised host.
