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

## 011 — One code namespace for book barcodes and reader cards

- **Context**: At the lending desk one scan field accepts both reader cards and books. A code that could mean either would be ambiguous.
- **Decision**: Every scannable code has one pointer item (`CODE#<code>`) with a `kind` (`copy` or `reader`), claimed with a conditional write. Generated card numbers start with `L` (L000123) so they look different from book barcodes (00000123).
- **Consequences**: One lookup tells the desk what was scanned, and a duplicate code is impossible. Imported card numbers that clash with a book barcode are refused with a clear message.

## 012 — Lending rules enforced in the database

- **Decision**: Check-out is one transaction: the reader must be active and below their maximum (a counter on the reader), the copy must be available, and the loan is written. Check-in reverses it with conditions so a book can't be returned twice. A repeat scan of the same book for the same reader within a minute is treated as a double scan. Due dates are calendar dates in Europe/Brussels, moved past closed weekdays and holidays.
- **Consequences**: Correct even with two desks or a nervous scanner. The reader's loan counter must only be changed by these transactions; reader edits use an update that never touches it.

## 013 — Readers get no login yet

- **Decision**: Readers are records only in phase 1; Cognito accounts for pupils and teachers come with the reader portal (phase 2). Card numbers can't change once created (they're printed on cards).
- **Consequences**: No account administration for hundreds of pupils yet. The reader portal will link accounts to existing readers.

## 014 — Lambdas are bundled by our own script

- **Context**: SAM's esbuild builder runs `npm install` inside the workspace, which removes the monorepo's dev dependencies.
- **Decision**: `npm run build:api` (scripts/build-api.mjs) bundles each Lambda with esbuild into `services/api/dist/<name>/`; the template points there and `sam deploy` uploads it. No `sam build`.
- **Consequences**: One build path for CI and deploys, easy to read. New Lambdas must be added to the script and the template.

## 015 — Labels and reader cards as PDFs made in the browser

- **Context**: Labels must land exactly on standard label sheets, and schools print on whatever printer they have.
- **Decision**: The web app builds PDFs with jsPDF (loaded only on the labels page) in millimetres for known sheet layouts (Avery L7651, L7159, L7160, Zweckform 3474) and credit-card-size reader cards, 10 per A4. Barcodes are Code 128, encoded by JsBarcode's encoder (rather than our own copy of the encoding table) and drawn as vector bars. People can start on a partly used sheet and nudge the alignment by a few millimetres (remembered per computer).
- **Consequences**: No server work or cost, and a PDF printed at 100% is far more exact than printing a web page. The built-in PDF font covers Western European characters; names in other scripts (e.g. Arabic) would need an embedded font.

## 016 — Two-step verification required for staff, enforced by the API

- **Context**: Staff can change the collection and see pupils' data. Cognito can make TOTP optional or required for the whole pool, not per group, and pupils won't have authenticator apps.
- **Decision**: The pool keeps MFA optional. The API refuses requests from admins and librarians whose account has no TOTP (`MFA_REQUIRED`), checked with Cognito `AdminGetUser` and cached for 15 minutes once enabled. The web app shows a setup screen (QR code) before the management pages. Locally (dev sign-in) the check is off.
- **Consequences**: A stolen staff password alone is not enough. One extra Cognito call per staff member per Lambda container every 15 minutes. A lost phone is reset by an admin (see README).

## 017 — Reading history is deleted after a retention period

- **Context**: Which child read which book is personal data; GDPR requires keeping it no longer than needed.
- **Decision**: A daily job (03:00 Brussels time) deletes returned loans older than `historyRetentionDays` (library setting, default 365). Each deleted loan first adds 1 to anonymous monthly counters (`STATS#<yyyy-mm>`: total and per title) in the same transaction. Staff can also export a reader's data (JSON) and delete a reader with their full history when no books are out. A public privacy page explains all this in plain Dutch.
- **Consequences**: Statistics remain possible without personal data. Overdue and current loans are never deleted. An alarm fires if the job fails.

## 018 — Three ISBN sources, including the Dutch libraries' open data

- **Context**: Open Library has few Dutch and Flemish books, and Google Books refuses requests without an API key and still misses many recent Dutch children's books (e.g. 9789043933728, 2024).
- **Decision**: Look up in order: Open Library, Google Books (optional API key in SSM `/library/google-books-api-key`), and the Dutch public libraries' catalogue at data.bibliotheken.nl (SPARQL, CC0 open data, no key). The first hit wins. When a source fails and none finds the ISBN, the API says "unavailable" (502) instead of "not found".
- **Consequences**: Much better coverage for a Flemish school. The Dutch catalogue has no covers; covers can be added later by hand. Only the ISBN is sent to these services.

## 019 — Covers can be uploaded by staff

- **Context**: Many Dutch books are found without a cover (decision 018), and new books aren't in any free source yet.
- **Decision**: Staff upload a photo or image on the title page. The browser turns it upright, scales it to at most 900 px and re-saves it as JPEG, which also strips photo metadata such as GPS location. The API accepts only real JPEG/PNG/WebP files (checked by their first bytes, at most 2 MB), sent as base64 JSON, and stores each upload under a new name (`covers/<titleId>-<id>.jpg`) so caches never show an old cover. Changing the cover doesn't change the title's version, so editing details at the same time doesn't conflict.
- **Consequences**: No presigned uploads or S3 CORS to manage. Replaced and removed covers are deleted from the bucket.
