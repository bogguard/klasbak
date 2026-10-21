# Security

Schoolbibliotheek holds data about children, so we take reports seriously.

## Reporting a vulnerability

Please don't open a public issue. Report it privately instead:

- through GitHub: **Security → Report a vulnerability** on this repository, or
- by email to tim@itrw.be.

Describe what you found and how to reproduce it. We confirm within a few working days, keep you
informed, and credit you when the fix is published (unless you prefer not to be named).

## Scope

The application code in this repository (`apps/`, `services/`, `packages/`, `infra/`) and the
product site (`site/`). Installations run by others are managed by their owners.

## What we do

Dependencies are checked by Dependabot and a weekly `npm audit` in CI; secrets never live in the
repository. The security design is described in `docs/decisions.md` (see decision 032 for the
latest review).
