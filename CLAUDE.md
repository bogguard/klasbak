# Library App

School library software: a public online catalogue, a circulation desk for librarians, a self-service kiosk and a portal for readers (pupils, teachers). Feature scope and roadmap: `docs/features.md`.

**Always follow the `pragmatic-serverless` skill** (`.claude/skills/pragmatic-serverless/`) for code, infrastructure, UI and reviews. Architecture decisions are logged in `docs/decisions.md` — read it before changing architecture and add an entry when you make a new decision.

## Language rules

- **Code, comments, commits, docs, API fields and translation keys are in English.**
- **The user interface is in Dutch (Flemish, `nl-BE`) by default**, with English (`en`) as second language. Every user-facing string goes through i18n (`apps/web/src/locales/`), including emails and printed labels.
- Use Flemish library vocabulary in the UI (see glossary), e.g. "reservatie", not "reservering".

## Stack

TypeScript everywhere · React + Vite (frontend) · Node.js Lambdas on AWS (backend) · AWS SAM / CloudFormation · DynamoDB · Cognito · S3 + CloudFront · SES · EventBridge Scheduler. Region: EU (`eu-west-1`). Details and rationale: the skill and `docs/decisions.md`.

## Repository layout

```
apps/web/            React frontend (public catalogue, desk, kiosk, reader portal, admin)
services/api/        Lambda functions per domain: catalog, circulation, readers, admin, jobs
packages/shared/     Zod schemas, types and pure domain rules shared by web and api
infra/               SAM template(s) and samconfig.toml
scripts/             deploy helpers
docs/                features.md, decisions.md, runbook.md
```

npm workspaces monorepo. Shared code goes in `packages/shared` only when used by both web and api.

## Commands

```bash
npm install                      # install all workspaces
npm run dev:local                # everything locally: DynamoDB Local + API (:3000) + frontend (:5173)
npm run seed                     # sample catalogue for local development
npm run dev                      # frontend only, against a deployed stack (VITE_PROXY_TARGET in apps/web/.env.local)
npm run typecheck && npm run lint && npm test
npm run build                    # build the frontend
npm run validate:infra           # sam validate --lint
npm run build:api                # bundle the Lambdas into services/api/dist (used by deploy)
npm run deploy:dev               # build:api + sam deploy of the dev stack (no `sam build`, see decision 014)
scripts/deploy-web.sh dev       # publish the frontend to the dev stack (name and logo: in the app)
```

The table's key design is documented in `services/api/src/lib/keys.ts`; keep it the single place for item keys.

Local development: the API runs as plain Hono apps on Node (`services/api/src/local/`). Keep Lambda handlers free of AWS-only assumptions so they keep working there; anything that writes public files goes through `lib/public-files.ts`.

## Domain glossary (code → UI nl-BE)

| Code (EN)            | UI (nl-BE)                          | Meaning                                                 |
| -------------------- | ----------------------------------- | ------------------------------------------------------- |
| Title                | Titel / Werk                        | Bibliographic record (book, magazine, DVD, game…)       |
| Copy                 | Exemplaar                           | Physical item with its own barcode                      |
| Collection           | Collectie / Deelcollectie           | Grouping of copies (e.g. per campus, classroom library) |
| Reader               | Ontlener / Lezer                    | Person who borrows (pupil, teacher, staff)              |
| Group                | Klas / Groep                        | Class or group of readers                               |
| Loan                 | Uitlening                           | A copy lent to a reader                                 |
| Check-out / Check-in | Uitlenen / Terugbrengen (inleveren) | Desk actions                                            |
| Renewal              | Verlenging                          | Extending a loan                                        |
| Reservation          | Reservatie                          | Reader waiting for a title                              |
| Loan policy          | Uitleenreglement                    | Rules: loan period, max items, renewals, fines          |
| Fine                 | Boete                               | Fee for late return                                     |
| Reminder             | Herinnering / Aanmaning             | Overdue notice                                          |
| Reading level        | Leesniveau (AVI, ZIZO)              | Reading level classification                            |
| Theme list           | Themalijst                          | Curated list of titles                                  |
| New acquisitions     | Aanwinsten                          | Recently added titles                                   |
| Closed day           | Sluitingsdag                        | Day the library is closed (affects due dates)           |

## Domain rules to keep in mind

- One active loan per copy; enforce with a DynamoDB condition.
- Due dates are calculated in `Europe/Brussels` and skip closed days and school holidays.
- A barcode scan must be safe to repeat (idempotent).
- Reading history is personal data: private by default, anonymised after the retention period.
- Many readers are children: no email required, simple login (member number + PIN or card scan at the kiosk).
