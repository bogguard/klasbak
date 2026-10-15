---
name: pragmatic-serverless
description: Engineering standards for building pragmatic, senior-quality serverless software on AWS with TypeScript, Node.js and React. Use whenever writing, changing, or reviewing application code, infrastructure (SAM/CloudFormation), APIs, data models, or UI in this repository — and when planning features or making architecture decisions.
---

# Pragmatic Serverless Engineering

You are acting as a senior engineer on a small team. The goal is software that is **simple, correct, secure, pleasant to use and cheap to run** — and that a new developer can understand within a day.

When two principles conflict, resolve in this order:
**correctness & security → simplicity → user experience → cost → elegance.**

---

## 1. Core principles

1. **Simple beats clever.** Choose the boring, well-documented option. No abstraction until the third time you need it. No framework you cannot explain in one sentence.
2. **Pragmatic, not dogmatic.** Best practices serve the product. If a "best practice" adds cost or complexity without a concrete benefit _for this project_, skip it and say why.
3. **Make it work, make it right, make it observable** — in that order, but all three before calling it done.
4. **Explain decisions.** Every non-obvious choice gets a short rationale: in a code comment (the _why_, never the _what_), in a PR description, or as an entry in `docs/decisions.md`.
5. **Small, reversible steps.** Small PRs, feature-flag or hide unfinished work, prefer additive changes to data models.
6. **Delete code.** Unused code, flags and config are liabilities. Remove them.

## 2. Default stack (use unless there is a written reason not to)

| Concern            | Choice                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Language           | TypeScript everywhere, `strict: true`, ESM                                                                                                   |
| Runtime            | Newest Node.js LTS Lambda runtime, `arm64` (cheaper and faster)                                                                              |
| Infra as code      | AWS SAM (CloudFormation). One template per deployable stack, `samconfig.toml` per environment                                                |
| API                | API Gateway **HTTP API** + Cognito JWT authorizer, served behind CloudFront on `/api/*` (same origin, no CORS)                               |
| Compute            | Lambda, bundled with esbuild via SAM (`BuildMethod: esbuild`)                                                                                |
| Lambda utilities   | Powertools for AWS Lambda (TypeScript): Logger, Metrics, Tracer, Idempotency, Parameters                                                     |
| AWS SDK            | AWS SDK for JavaScript **v3**, modular clients only (`@aws-sdk/client-*`, `@aws-sdk/lib-dynamodb`). Create clients once, outside the handler |
| Data               | DynamoDB, on-demand capacity, point-in-time recovery on, access patterns documented first                                                    |
| Files              | S3 (private, Block Public Access, served only through CloudFront with OAC)                                                                   |
| Auth               | Amazon Cognito user pool; roles via groups                                                                                                   |
| Async / scheduling | EventBridge Scheduler for cron, SQS for buffering/retries, DLQs everywhere async                                                             |
| Email              | Amazon SES (DKIM + SPF + DMARC configured)                                                                                                   |
| Validation         | Zod schemas shared between frontend and backend                                                                                              |
| Frontend           | React + Vite + TypeScript, TanStack Query, React Router, Tailwind CSS, accessible primitives (Radix / shadcn/ui)                             |
| i18n               | `react-i18next`; all user-facing text via translation keys                                                                                   |
| Tests              | Vitest (unit/integration), `aws-sdk-client-mock`, Playwright for a few critical end-to-end flows, axe for accessibility                      |
| Quality            | ESLint (flat config, `typescript-eslint` strict), Prettier, `cfn-lint` on templates                                                          |
| CI/CD              | GitHub Actions with OIDC role assumption (no long-lived AWS keys)                                                                            |

Before adding any dependency ask: is it maintained, small, typed, and does it remove more code than it adds? Prefer the platform (Web APIs, Node built-ins) first.

## 3. Code style (senior quality, not senior complexity)

- **Structure by feature/domain**, not by technical layer: `catalog/`, `circulation/`, `readers/`. Inside a domain: `handler` (HTTP in/out only) → `service` (business rules, pure where possible) → `repository` (DynamoDB access).
- **Handlers are thin.** Parse + validate input with Zod, call the service, map result to HTTP. No business logic in handlers.
- **Business rules are pure functions** where possible (e.g. `calculateDueDate(policy, today, closedDays)`). They are trivial to test and to read.
- **Types flow from schemas**: `type Loan = z.infer<typeof LoanSchema>`. One source of truth.
- **Names say what things are** in the domain language (see glossary in `CLAUDE.md`). Functions are verbs, booleans read as questions (`isOverdue`).
- **Errors are explicit**: throw typed domain errors (`CopyNotAvailableError`) and map them to HTTP status codes in one place. Never swallow errors; never leak stack traces or internals to clients.
- **No `any`.** Use `unknown` and narrow. No non-null assertions without a comment.
- Functions short enough to read without scrolling; files focused on one thing.
- Comments explain _why_, constraints and gotchas. Self-explanatory code needs none.
- Consistent API shape: JSON, camelCase, ISO-8601 UTC timestamps, cursor-based pagination, error body `{ "error": { "code": "COPY_NOT_AVAILABLE", "message": "..." } }`.

## 4. Robustness

- **Validate at every boundary** (HTTP input, events, third-party responses). Trust nothing from outside.
- **Idempotent mutations.** Scanners double-scan and networks retry: use conditional writes and/or Powertools Idempotency on create/check-out style operations.
- **Consistency with transactions/conditions.** Use `TransactWriteItems` and `ConditionExpression` to enforce invariants (e.g. one active loan per copy) at the database, not only in code.
- **Async work is retryable**: SQS + DLQ, `ReportBatchItemFailures` for batch processing, alarms on DLQ depth.
- **Timeouts are deliberate**: Lambda timeout < API Gateway timeout; outbound HTTP calls have explicit timeouts and graceful fallbacks (e.g. ISBN lookup fails → allow manual entry).
- **Time zones**: store UTC; compute business dates (due dates, opening days) in the configured local time zone.

## 5. Security & privacy by design

See `references/security-privacy.md` for the checklist. Non-negotiables:

- **Least privilege IAM**: use SAM policy templates scoped to a single resource (`DynamoDBCrudPolicy: { TableName: !Ref Table }`). Never `*` on resources without a written reason.
- **Authorize every request on the server** — check role _and_ ownership (a reader can only see their own loans). The UI hiding a button is not security.
- **No secrets in code, templates or env files committed to git.** Use SSM Parameter Store (SecureString) or Secrets Manager, read via Powertools Parameters with caching.
- **Encrypt at rest and in transit** (default AWS-owned keys are fine unless a requirement says otherwise). TLS only.
- **Security headers** through a CloudFront response headers policy: strict CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, frame-ancestors none.
- **Privacy (GDPR)**: collect the minimum, define retention for every personal data field, anonymise history when it is no longer needed, never log personal data (log IDs, not names/emails), support export and deletion of a person's data.
- **Dependencies**: lockfile committed, `npm audit` / Dependabot in CI, pin GitHub Actions to SHAs.

## 6. Observability & transparency

- **Structured JSON logs** via Powertools Logger with a correlation id; log level from env var. Log decisions and failures, not noise.
- **Business metrics** via Powertools Metrics (EMF — no extra API calls): e.g. `LoanCreated`, `LoanReturned`, `ReminderSent`.
- **Alarms that matter, sent to an SNS topic with email subscription**: Lambda errors, API 5xx rate, DLQ depth > 0, throttles, budget threshold. No alarm without an action.
- **Tracing**: Powertools Tracer (X-Ray) on, sampling at default rate.
- **Log retention set explicitly** on every log group (e.g. 30 days in prod, 7 in dev). Never "never expire".
- **Audit trail** for important domain actions (who changed what, when) stored as data, viewable by admins.
- Transparency toward users: clear status and error messages, visible history of their own loans, a readable privacy page.

## 7. Cost control

- Serverless and **pay-per-use first**: on-demand DynamoDB, HTTP API (not REST API) unless a REST-only feature is needed, arm64 Lambdas, right-sized memory (start at 512 MB, measure).
- **Avoid always-on costs**: no NAT gateways, no VPC for Lambdas unless required, no provisioned concurrency, no OpenSearch/RDS clusters without a clear need and a cost estimate.
- **AWS Budgets alarm** in every account with email notification.
- **Tag every resource** (`project`, `environment`) via SAM `Globals` / stack tags for cost allocation.
- Set log retention, S3 lifecycle rules for temporary data, and TTL on ephemeral DynamoDB items.
- When proposing anything that has a fixed monthly cost, state the estimate.

## 8. UX, usability and visual design

See `references/frontend-ux.md`. In short:

- **Design for the real users and the real context** (a busy desk, a child at a kiosk, a teacher on a phone). Fast paths for frequent tasks; keyboard and barcode-scanner friendly.
- **Accessible by default: WCAG 2.2 AA.** Semantic HTML, labels, focus states, sufficient contrast, works with keyboard only.
- **Clean, calm, consistent visual design**: one design system (Tailwind tokens + shared components), generous whitespace, clear hierarchy, max two font weights per view, a restrained color palette with one accent color.
- **Every state is designed**: loading (skeletons), empty (helpful next step), error (what happened + what to do), success (clear feedback).
- **Responsive and mobile-first**; the public catalogue must work great on a phone.
- **Copy is short, friendly and in the user's language**; no jargon, no technical error text.

## 9. Infrastructure as code

See `references/aws-sam.md` for conventions and a snippet. Key rules:

- Everything is in templates. No click-ops; if you had to click, document it and automate it next.
- Parameters for environment differences; no copy-pasted templates per environment.
- `DeletionPolicy: Retain` + `UpdateReplacePolicy: Retain` on stateful resources (tables, buckets, user pools).
- `sam validate --lint` and `cfn-lint` pass before commit.
- Outputs for everything other stacks or the frontend need.

## 10. Testing strategy

- **Unit tests for business rules** (fast, many): due dates, renewal limits, reservation queue.
- **Integration tests for repositories and handlers** with mocked AWS clients (or DynamoDB Local where queries matter).
- **A handful of Playwright E2E tests** for critical journeys (search → detail; check-out → check-in; reader login → renew).
- Test behaviour, not implementation. A failing test should tell you what broke in domain terms.
- CI runs: typecheck, lint, test, `sam validate --lint`, build. Main branch is always deployable.

## 11. Definition of done

Before saying a task is done, verify (see `references/review-checklist.md`):

- [ ] Works end-to-end; typecheck, lint and tests pass
- [ ] Input validated, authorization checked server-side, no secrets or personal data in logs
- [ ] Errors handled with useful user-facing messages (translated)
- [ ] Logs/metrics/alarms in place for new failure modes
- [ ] Loading/empty/error states designed; keyboard and screen-reader usable
- [ ] All UI text translated (nl-BE and en)
- [ ] IaC updated; no new fixed-cost resource without a stated estimate
- [ ] Docs/decision log updated if behaviour or architecture changed

## 12. How to work

- Start by restating the goal and the simplest design that meets it. Mention trade-offs briefly; recommend one option.
- Suggest missing pieces (a forgotten edge case, privacy concern, missing alarm) proactively but concisely.
- Prefer modifying existing patterns in the codebase over introducing new ones. Consistency beats local perfection.
- When unsure about the latest AWS/SDK behaviour, check the official docs rather than guessing.
