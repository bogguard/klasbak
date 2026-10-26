---
name: pragmatic-serverless
description: Engineering standards for building pragmatic, senior-quality serverless software on AWS with TypeScript, Node.js and React. Use whenever writing, changing, or reviewing application code, infrastructure (SAM/CloudFormation), APIs, data models, or UI in a project that uses this stack — and when planning features or making architecture decisions.
---

# Pragmatic Serverless Engineering

You are acting as a senior engineer on a small team. The goal is software that is **simple, correct, secure, pleasant to use and cheap to run** — and that a new developer can understand within a day.

When two principles conflict, resolve in this order:
**correctness & security → simplicity → user experience → cost → elegance.**

**Project specifics live in the project's `CLAUDE.md`**: its languages, domain glossary, roles, region, users and domain rules. This skill gives the general standards; where the project's `CLAUDE.md` is more specific, it wins. Examples in this skill (a school library, a lending desk) are illustrations, not requirements.

---

## 1. Core principles

1. **Simple beats clever.** Choose the boring, well-documented option. No abstraction until the third time you need it. No framework you cannot explain in one sentence.
2. **Pragmatic, not dogmatic.** Best practices serve the product. If a "best practice" adds cost or complexity without a concrete benefit _for this project_, skip it and say why.
3. **Make it work, make it right, make it observable** — in that order, but all three before calling it done.
4. **Explain decisions.** Every non-obvious choice gets a short rationale: in a code comment (the _why_, never the _what_), in a PR description, or as an entry in `docs/decisions.md`.
5. **Small, reversible steps.** Small PRs, feature-flag or hide unfinished work, prefer additive changes to data models.
6. **Delete code.** Unused code, flags and config are liabilities. Remove them.
7. **The README is part of the change.** It is the way in for the next developer and the operator: what the project is, how to run it locally (including demo or sample data), how to set up, deploy and follow up an installation. Update it in the same change that adds or alters a command, script, setup step, setting or visible feature, and make sure its commands work as written.

## 2. Default stack (use unless there is a written reason not to)

| Concern            | Choice                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Language           | TypeScript everywhere, `strict: true`, ESM                                                                                                   |
| Infra as code      | AWS SAM (CloudFormation). One template per deployable stack, `samconfig.toml` per environment                                                |
| API                | API Gateway **HTTP API** + Cognito JWT authorizer, served behind CloudFront on `/api/*` (same origin, no CORS)                               |
| Compute            | AWS Lambda, following the best practices in `references/aws-sam.md` (newest Node.js LTS runtime, `arm64`, one function per domain area)      |
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

## 3. Repository layout

One layout, the same in every project, so anyone finds anything in seconds. A **domain area** (e.g. `orders`, `billing`, `catalog`) has the **same name** in the frontend, the API and the shared package.

```
apps/web/src/
  app/                    # routing, layout shells, route guards
  components/ui/          # shared design-system components (Button, Feedback, Form …)
  features/<domain>/      # everything for one domain area of the UI
    <Name>Page.tsx        #   one page per route
    <Name>.tsx            #   components used only in this domain
    api.ts                #   TanStack Query hooks for this domain's endpoints
    <topic>.ts            #   pure helpers (grouping, formatting, PDFs) …
    <topic>.test.ts       #   … with their tests right next to them
  lib/                    # app-wide helpers: API client, auth, config, i18n, formatting
  locales/                # one JSON file per language
services/api/src/
  <domain>/
    handler.ts            # HTTP in/out only: routes, validation, status codes
    service.ts            # business rules
    repository.ts         # database access
    <topic>.test.ts       # tests next to the code
  lib/                    # shared infrastructure: AWS clients, auth, errors, keys, observability
packages/shared/src/      # Zod schemas, types and pure rules used by both web and api
infra/                    # template.yaml, samconfig.toml
scripts/                  # deploy and setup helpers
docs/                     # decisions.md, features.md, runbook.md
```

Naming: React components and pages `PascalCase.tsx`; everything else `camelCase.ts`; folders lowercase (`kebab-case` when two words). Code goes in `packages/shared` only when both web and api use it.

## 4. Code style (senior quality, not senior complexity)

- **Structure by domain**, not by technical layer (see the layout above). Inside a domain: `handler` (HTTP in/out only) → `service` (business rules, pure where possible) → `repository` (database access).
- **Handlers are thin.** Parse + validate input with Zod, call the service, map result to HTTP. No business logic in handlers.
- **Business rules are pure functions** where possible (e.g. `calculateDueDate(policy, today, closedDays)`). They are trivial to test and to read.
- **Types flow from schemas**: `type Order = z.infer<typeof OrderSchema>`. One source of truth.
- **Names say what things are** in the domain language (the glossary in the project's `CLAUDE.md`). Functions are verbs, booleans read as questions (`isOverdue`).
- **Errors are explicit**: throw typed domain errors and map them to HTTP status codes in one place. Never swallow errors; never leak stack traces or internals to clients.
- **No `any`.** Use `unknown` and narrow. No non-null assertions without a comment.
- Functions short enough to read without scrolling; files focused on one thing.
- Comments explain _why_, constraints and gotchas. Self-explanatory code needs none.
- Consistent API shape: JSON, camelCase, ISO-8601 UTC timestamps, cursor-based pagination, error body `{ "error": { "code": "OUT_OF_STOCK", "message": "...", "details": {} } }`. The UI translates the code, using the details.

## 5. Robustness

- **Validate at every boundary** (HTTP input, events, third-party responses). Trust nothing from outside.
- **Idempotent mutations.** Scanners double-scan, people double-click and networks retry: use conditional writes and/or Powertools Idempotency on create-style operations.
- **Consistency with transactions/conditions.** Use `TransactWriteItems` and `ConditionExpression` to enforce invariants (e.g. one active loan per item) at the database, not only in code.
- **Async work is retryable**: SQS + DLQ, `ReportBatchItemFailures` for batch processing, alarms on DLQ depth.
- **Timeouts are deliberate**: Lambda timeout < API Gateway timeout; outbound HTTP calls have explicit timeouts and graceful fallbacks (e.g. a lookup service fails → allow manual entry).
- **Time zones**: store UTC; compute business dates (due dates, opening days) in the configured local time zone.
- **Text from outside is normalised** (trim, Unicode NFC) at the boundary.

## 6. Security & privacy by design

See `references/security-privacy.md` for the checklist. Non-negotiables:

- **Least privilege IAM**: use SAM policy templates scoped to a single resource (`DynamoDBCrudPolicy: { TableName: !Ref Table }`). Never `*` on resources without a written reason.
- **Authorize every request on the server** — check role _and_ ownership (a user can only see their own records). The UI hiding a button is not security.
- **No secrets in code, templates or env files committed to git.** Use SSM Parameter Store (SecureString) or Secrets Manager, read via Powertools Parameters with caching.
- **Encrypt at rest and in transit** (default AWS-owned keys are fine unless a requirement says otherwise). TLS only.
- **Security headers** through a CloudFront response headers policy: strict CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, frame-ancestors none.
- **Privacy (GDPR)**: collect the minimum, define retention for every personal data field, anonymise history when it is no longer needed, never log personal data (log IDs, not names/emails), support export and deletion of a person's data.
- **Dependencies**: lockfile committed, `npm audit` / Dependabot in CI, pin GitHub Actions to SHAs.

## 7. Observability & transparency

- **Structured JSON logs** via Powertools Logger with a correlation id; log level from env var. Log decisions and failures, not noise.
- **Business metrics** via Powertools Metrics (EMF — no extra API calls): one per meaningful domain event (e.g. `OrderPlaced`, `ReminderSent`).
- **Alarms that matter, sent to an SNS topic with email subscription**: Lambda errors, API 5xx rate, DLQ depth > 0, throttles, budget threshold. No alarm without an action.
- **Tracing**: Powertools Tracer (X-Ray) on, sampling at default rate.
- **Log retention set explicitly** on every log group (e.g. 30 days in prod, 7 in dev). Never "never expire".
- **Audit trail** for important domain actions (who changed what, when) stored as data, viewable by admins.
- Transparency toward users: clear status and error messages, visible history of their own data, a readable privacy page.

## 8. Cost control

- Serverless and **pay-per-use first**: on-demand DynamoDB, HTTP API (not REST API) unless a REST-only feature is needed, arm64 Lambdas, right-sized memory (start at 512 MB, measure).
- **Avoid always-on costs**: no NAT gateways, no VPC for Lambdas unless required, no provisioned concurrency, no OpenSearch/RDS clusters without a clear need and a cost estimate.
- **AWS Budgets alarm** in every account with email notification.
- **Tag every resource** (`project`, `environment`) via SAM `Globals` / stack tags for cost allocation.
- Set log retention, S3 lifecycle rules for temporary data, and TTL on ephemeral DynamoDB items.
- When proposing anything that has a fixed monthly cost, state the estimate.

## 9. UX, usability and visual design

See `references/frontend-ux.md`. In short:

- **Design for the real users and the real context** (e.g. a busy desk, a child at a shared screen, a teacher on a phone). Fast paths for frequent tasks; keyboard and scanner friendly where relevant.
- **Usability reviewed like a demanding UX engineer**: one action instead of modes, defaults instead of settings, repeat-safe actions, no stale state on shared screens, the forgotten/lost/wrong cases handled, errors that say what to do, and every workflow walked end to end per persona before it's done.
- **Accessible by default: WCAG 2.2 AA.** Semantic HTML, labels, focus states, sufficient contrast, works with keyboard only.
- **Designed with character, like a good designer would**: a palette and typography that fit the place and its people (not default greys), semantic tokens so light/dark and the customer's branding change in one place, content as the visual, generated placeholders instead of empty boxes, max two font weights per view and one accent color.
- **Verify visually**: screenshot changed pages (desktop, phone, dark) and render generated PDFs, then look at them before calling it done.
- **Printed material is product too**: exact physical sizes, scannable barcodes, crop marks, text safe for PDF fonts.
- **Every state is designed**: loading (skeletons), empty (helpful next step), error (what happened + what to do), success (clear feedback).
- **Responsive and mobile-first**; public pages must work great on a phone.
- **Copy is short, friendly and in the user's language**; no jargon, no technical error text.

## 10. Infrastructure as code

See `references/aws-sam.md` for conventions, Lambda best practices and a snippet. Key rules:

- Everything is in templates. No click-ops; if you had to click, document it and automate it next.
- Parameters for environment differences; no copy-pasted templates per environment.
- `DeletionPolicy: Retain` + `UpdateReplacePolicy: Retain` on stateful resources (tables, buckets, user pools).
- **A backup you never restored is a hope**: restore a table from PITR once per project and write the steps in `docs/runbook.md`.
- `sam validate --lint` and `cfn-lint` pass before commit.
- Outputs for everything other stacks or the frontend need.

## 11. Testing strategy

- **Unit tests for business rules** (fast, many): calculations, limits, state transitions.
- **Integration tests for repositories and handlers** with mocked AWS clients (or DynamoDB Local where queries matter).
- **A handful of Playwright E2E tests** for critical journeys (the two or three flows the product exists for).
- Test behaviour, not implementation. A failing test should tell you what broke in domain terms.
- CI runs: typecheck, lint, test, `sam validate --lint`, build. Main branch is always deployable.

## 12. Branches, pull requests and releases

- **Trunk-based**: `main` is the only long-lived branch. Feature branches live hours to a day or two, never weeks; rebase on `main` daily.
- **One concern per PR**, small enough to review in 15 minutes. Split refactors from behaviour changes. Unfinished work is merged behind a flag or hidden, not kept on a branch.
- **The PR description says why**, what changed for the user, how it was tested, and has screenshots for UI changes. Link the decision log entry if there is one.
- **Branch protection on `main`**: CI green and one review required (once there is more than one maintainer), no direct pushes, squash merge so every commit on `main` is one working change.
- **Every merge deploys to dev automatically**; prod deploys from `main` with a manual approval in GitHub Actions (environment protection), never from a laptop.
- **Safe rollouts**: `AutoPublishAlias` + `DeploymentPreference` (e.g. `Linear10PercentEvery1Minute` in prod) with the error alarms as rollback triggers.
- **Data changes are expand → migrate → contract** over separate deploys: add the new attribute or index, backfill with an idempotent script, switch reads, only then remove the old one.

## 13. Definition of done

Before saying a task is done, verify (see `references/review-checklist.md`):

- [ ] Works end-to-end; typecheck, lint and tests pass
- [ ] Input validated, authorization checked server-side, no secrets or personal data in logs
- [ ] Errors handled with useful user-facing messages (translated)
- [ ] Logs/metrics/alarms in place for new failure modes
- [ ] Loading/empty/error states designed; keyboard and screen-reader usable; checked visually
- [ ] All UI text translated into the project's languages (see `CLAUDE.md`)
- [ ] IaC updated; no new fixed-cost resource without a stated estimate
- [ ] README still true (commands, setup, local and demo data, features); decision log updated if behaviour or architecture changed

## 14. How to work

- Start by restating the goal and the simplest design that meets it. Mention trade-offs briefly; recommend one option.
- Suggest missing pieces (a forgotten edge case, privacy concern, missing alarm) proactively but concisely.
- Prefer modifying existing patterns in the codebase over introducing new ones. Consistency beats local perfection.
- When unsure about the latest AWS/SDK behaviour, check the official docs rather than guessing.
