# Security & privacy checklist

## Identity & access

- Cognito user pool; roles as groups (e.g. `admin`, `librarian`, `teacher`, `reader`). The JWT `cognito:groups` claim drives authorization in the backend.
- Authorize in the service layer: role check **and** ownership check. Default deny.
- Strong password policy for staff; MFA required for `admin` and `librarian`.
- Short-lived access tokens; refresh tokens rotated. Tokens stored by the auth library, never in `localStorage` by hand.
- Rate-limit public endpoints (HTTP API throttling settings; WAF rate rules only if abuse appears).

## Data protection

- Encryption at rest (DynamoDB, S3 default SSE) and in transit (TLS only, HSTS).
- S3 buckets: Block Public Access on, access only via CloudFront OAC, bucket policy enforcing TLS.
- Backups: DynamoDB PITR on; test a restore once.
- Secrets in SSM SecureString / Secrets Manager; never in env files committed to git.

## Privacy (GDPR, especially with minors)

- **Data minimisation**: store only what the library needs (name, class, member number, optional parent/teacher email). No birth dates, addresses or photos unless there is a clear purpose.
- **Retention** per data type, documented: e.g. loan history linked to a person anonymised after N months / at end of school year; inactive readers removed after leaving school.
- **Purpose limitation**: reading history is private; staff see it only when needed for operations. Statistics use aggregated/anonymised data.
- **Rights**: export a person's data (JSON/CSV) and delete/anonymise on request — build these as admin actions.
- **No personal data in logs, metrics, URLs or error messages.** Log IDs only.
- **Third parties**: only send ISBNs (never personal data) to metadata providers. Document all processors (AWS, email) in the privacy page.
- Region: deploy in an EU region (e.g. `eu-west-1` or `eu-central-1`) and keep data there.
- Provide a privacy notice in plain Dutch, written for parents and children.

## Application security

- Validate all input with Zod; reject unknown fields at API boundaries.
- Output-encode by default (React does); never use `dangerouslySetInnerHTML` with user content (sanitize with DOMPurify if ever needed, e.g. news posts in rich text).
- CSP without `unsafe-inline` scripts; frame-ancestors `'none'`.
- File uploads (cover images): presigned S3 PUT with content-type and size limits; never serve user uploads from the app origin without the right `Content-Type`.
- Dependencies: Dependabot, `npm audit --omit=dev` in CI, minimal dependency count.
- CI uses GitHub OIDC with a deploy role scoped to the stacks it deploys.
- CloudTrail on in the account (default event history at least), root account MFA, no IAM users with access keys.
