# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability, **please do not open a public issue.**

Instead, email **brianmuhorow@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You should receive an acknowledgment within **48 hours**. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Security Practices

### Authentication

- JWT-based authentication with RSA-2048 signing
- Short-lived access tokens (15 min) with refresh token rotation
- Account lockout after repeated failed login attempts
- Passwords hashed with bcrypt

### API

- All endpoints enforce authentication via middleware (except public routes)
- Request body size limited to 1 MB
- 30-second request timeout
- Rate limiting on sensitive endpoints
- CORS configured per environment

### Data

- PostgreSQL with parameterized queries (no raw SQL interpolation)
- Environment-based configuration — no secrets in source code
- `.env.example` provided with placeholder values only

### Infrastructure

- TLS required in production
- Docker containers run as non-root where possible
- Dependencies are pinned to specific versions

## Disclosure Policy

We follow responsible disclosure. Once a fix is released, we will:

1. Credit the reporter (unless they prefer anonymity)
2. Publish a brief advisory describing the issue and fix
3. Tag a new release with the patch
