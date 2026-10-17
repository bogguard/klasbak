# Security & privacy checklist

The project's `CLAUDE.md` names its roles, users, region and privacy audience; this checklist applies them.

## Identity & access

- Cognito user pool; roles as groups (the project's roles, e.g. `admin`, `staff`, `user`). The JWT `cognito:groups` claim drives authorization in the backend.
- Authorize in the service layer: role check **and** ownership check. Default deny.
- Strong password policy; **MFA required for every role that can see or change other people's data**, enforced by the API, not only the login screen.
- Short-lived access tokens; refresh tokens rotated. Tokens stored by the auth library, never in `localStorage` by hand.
- Rate-limit public endpoints (HTTP API throttling settings; WAF rate rules only if abuse appears).

## Data protection

- Encryption at rest (DynamoDB, S3 default SSE) and in transit (TLS only, HSTS).
- S3 buckets: Block Public Access on, access only via CloudFront OAC, bucket policy enforcing TLS.
- Backups: DynamoDB PITR on; test a restore once.
- Secrets in SSM SecureString / Secrets Manager; never in env files committed to git.

## Privacy (GDPR; extra care with minors)

- **Data minimisation**: store only what the product needs for its purpose; no birth dates, addresses or photos unless there is a clear purpose. The project's `CLAUDE.md` lists what is collected.
- **Retention** per data type, documented: e.g. history linked to a person deleted or anonymised after N months; people who leave removed.
- **Purpose limitation**: personal history is private; staff see it only when needed for operations. Statistics use aggregated, anonymous data — counted without linking to a person, never ranked per person.
- **Rights**: export a person's data (JSON/CSV) and delete/anonymise on request — build these as admin actions. Offer the customer a full export of all their data.
- **No personal data in logs, metrics, URLs or error messages.** Log IDs only.
- **Third parties**: send them only non-personal data (e.g. a product code to a metadata service). Serve fetched third-party content (images) from your own origin so visitors don't contact third parties. Document all processors (hosting, email) on the privacy page and in the data processing agreement.
- **Region**: keep data where the project requires (EU data in an EU region).
- **Privacy notice** in plain language for the real audience (e.g. parents and children), in the project's language.

## Application security

- Validate all input with Zod; reject unknown fields at API boundaries.
- Output-encode by default (React does); never use `dangerouslySetInnerHTML` with user content (sanitize with DOMPurify if ever needed).
- CSP without `unsafe-inline` scripts; frame-ancestors `'none'`.
- File uploads (images): check type and size on the server, re-encode or verify the content, refuse SVG (it can carry scripts), and serve uploads with the right `Content-Type`.
- Dependencies: Dependabot, `npm audit --omit=dev` in CI (also on a weekly schedule), minimal dependency count, a secret scan (e.g. gitleaks) before a repository goes public.
- CI uses GitHub OIDC with a deploy role scoped to the stacks it deploys.
- CloudTrail on in the account (default event history at least), root account MFA, no IAM users with long-lived access keys.
