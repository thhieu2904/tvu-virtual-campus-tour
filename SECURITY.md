# Security Policy

## Supported version

Security fixes target the current `main` branch. Older commits, academic snapshots, and personal forks are not maintained release channels.

## Report a vulnerability privately

Please use [GitHub Private Vulnerability Reporting](https://github.com/thhieu2904/tvu-virtual-campus-tour/security/advisories/new) when it is available for this repository.

Do not disclose a vulnerability, credential, personal record, private university document, or production URL containing a secret in a public issue. If private reporting is unavailable, open a public issue containing only a request for a private contact channel and no sensitive technical details.

Useful reports include:

- the affected commit, endpoint, or component;
- the minimum steps needed to reproduce the problem;
- the security impact and required preconditions;
- a proof of concept with secrets and personal data removed;
- a suggested remediation, if known.

## High-priority areas

The most sensitive surfaces in this project are:

- Supabase administrator authentication and service-role access;
- document and media ingestion;
- Gemini prompts, retrieved documents, and tool-action validation;
- Cloudflare R2 upload and public-object handling;
- chat/TTS abuse, resource exhaustion, and request-size controls;
- production environment variables and deployment credentials.

## Research guidelines

- Use your own development environment and test data whenever possible.
- Do not access, modify, retain, or publish another person's data.
- Do not degrade the public demo, exhaust paid API quotas, or test denial-of-service techniques.
- Stop when a test could affect production availability or data integrity.

Reports about ordinary model-quality errors without a security consequence, vendor outages, or unsupported historical snapshots may be handled as regular issues rather than vulnerabilities.
