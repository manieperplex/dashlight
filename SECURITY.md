# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Use GitHub's private vulnerability reporting instead:
**[Report a vulnerability →](../../security/advisories/new)**

Include as much of the following as you can:

- Description of the vulnerability and its potential impact
- Steps to reproduce or a minimal proof of concept
- Affected versions
- Suggested fix, if you have one

You will receive an acknowledgement within **5 business days** and a resolution timeline once the issue has been assessed.

## Scope

Dashlight is a self-hosted tool. The attack surface most relevant to report:

- Authentication bypass or session fixation in the OAuth flow
- Token leakage — the GitHub access token must never reach the browser
- CSRF on mutating proxy endpoints (POST/PATCH/DELETE)
- Cache poisoning via crafted GitHub API responses
- Injection via user-controlled inputs passed to the GitHub API proxy

## Out of scope

- Vulnerabilities in GitHub's own API
- Issues in your self-hosted infrastructure (e.g. an exposed Docker socket)
- Rate-limit bypass that only affects the reporting user's own session
