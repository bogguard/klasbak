# Decision log

Short architecture decision records. Newest at the bottom. Format: context → decision → consequences. Revisit when the context changes.

## 001 — Serverless on AWS with SAM

- **Context**: Small team, a school-sized workload (hundreds of users, peaks during breaks), tight budget, little ops capacity.
- **Decision**: Lambda + HTTP API + DynamoDB + S3/CloudFront + Cognito, defined in AWS SAM. EU region (`eu-west-1`).
- **Consequences**: Near-zero cost when idle, no servers to patch. We must model DynamoDB access patterns up front.

## 002 — One deployment per school (single-tenant)

- **Context**: The first customer is one school. Multi-tenancy adds complexity in every query and in security.
- **Decision**: One stack per school. No `tenantId` in keys.
- **Consequences**: Strong isolation, simple code. For many schools, deployment automation matters more; revisit if it becomes a SaaS for 10+ schools.

## 003 — Catalogue search without a search cluster

- **Context**: OpenSearch has a high fixed monthly cost. A school catalogue usually has fewer than 50,000 titles.
- **Decision**: Build a compact search index (MiniSearch or Orama) from the titles whenever the catalogue changes, store it in S3 and serve it through CloudFront. The public catalogue searches in the browser. Availability comes from the API.
- **Consequences**: Instant, typo-tolerant search at almost no cost. The index is public, so it contains only public catalogue data. Revisit above ~100k titles or if the index exceeds ~5 MB gzipped.

## 004 — Single-table DynamoDB design

- **Context**: Clear, limited access patterns; on-demand pricing.
- **Decision**: One table (`pk`, `sk`) plus overloaded GSIs as needed. Initial access patterns:
  - Title by id; copies of a title
  - Copy by barcode
  - Reader by id / by member number; readers by group
  - Active loans by reader; active loan by copy
  - Overdue loans (sparse GSI on active loans, sorted by due date)
  - Reservation queue by title
  - Audit events by entity
- **Consequences**: Cheap and fast. New access patterns need a design step. Document them here.

## 005 — Same-origin frontend and API through CloudFront

- **Decision**: One CloudFront distribution: S3 for the SPA, `/api/*` to API Gateway HTTP API.
- **Consequences**: No CORS, one place for security headers and an optional WAF later.

## 006 — Own login screen instead of the Cognito hosted login page

- **Context**: The hosted login page needs callback URLs on the app client. Those point at CloudFront, which points at the API, whose authorizer points back at the app client: a circular dependency in the template. The hosted page is also not well suited to children and Dutch wording.
- **Decision**: The web app has its own login screen (Amplify Auth, SRP sign-in) against a Cognito app client without OAuth flows. Usernames are member numbers; the school creates all accounts (no self sign-up).
- **Consequences**: Full control over wording, language and child-friendly design; no circular dependency. We build the "new password" and MFA challenge screens ourselves.

## 007 — Scope choices for the first school (2026-10-15)

- **Decision**: Fines are not built for now (loan policies get no fine fields yet). No data migration from another system. Smartschool login is not a priority.
- **Consequences**: Less to build in phase 1. Revisit each when a school asks for it.

## 008 — Covers are copied to our own bucket

- **Context**: Hot-linking covers from Open Library or Google would make every visitor's browser (often a child's) contact those services.
- **Decision**: When a title is saved with a cover from the ISBN lookup, the API downloads it (allow-listed hosts only, size and type checked) to `covers/` in the web bucket.
- **Consequences**: Better privacy and reliability; covers count toward S3 storage (a few cents per thousand titles).

## 009 — Audit trail as DynamoDB items

- **Decision**: Every change by staff writes an audit item (`AUDIT#<entity>`) in the same transaction as the change. It holds who, what action, when, and which field names changed; never field values. Items expire after 2 years via TTL.
- **Consequences**: Audit can never be out of sync with the data. An admin view comes later.

## 010 — Local development without AWS

- **Context**: Developing against AWS for every change is slow, and contributors to an open-source project may have no AWS account.
- **Decision**: The Hono apps also run on Node through a small local server, with DynamoDB Local in Docker. The local server stands in for the AWS glue: a dev sign-in header instead of the JWT authorizer, an index rebuild after each change instead of the stream, and files on disk instead of S3/CloudFront. It only exists in `services/api/src/local/` and is never deployed.
- **Consequences**: A fast feedback loop and no cloud costs for development. The AWS glue itself (authorizer, stream, IAM) is only exercised on a deployed dev stack, so test there before production.
