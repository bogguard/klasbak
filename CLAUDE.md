# Klasbak

Practical tools for schools (decision 036). The first module is the school library: a public online catalogue, a circulation desk for librarians, a self-service kiosk and a portal for readers (pupils, teachers). Feature scope and roadmap: `docs/features.md`.

**Always follow the `pragmatic-serverless` skill** (`.claude/skills/pragmatic-serverless/`) for code, infrastructure, UI and reviews. The skill is generic and maintained in [bogguard/pragmatic-serverless-skill](https://github.com/bogguard/pragmatic-serverless-skill); the copy here is updated from there, so improve it there first. This file holds what is specific to this project and wins where it is more specific. Architecture decisions are logged in `docs/decisions.md` — read it before changing architecture and add an entry when you make a new decision.

## Language rules

- **Code, comments, commits, docs, API fields and translation keys are in English.**
- **The user interface is in Dutch (Flemish, `nl-BE`) by default**, with English (`en`) as second language. Every user-facing string goes through i18n (`apps/web/src/locales/`), including emails and printed labels.
- Use Flemish library vocabulary in the UI (see glossary), e.g. "reservatie", not "reservering".
- The library chooses its kind (school or organisation) and its own words for reader types and groups (decision 034). UI texts never write "leerling", "leerkracht" or "klas" literally: use `{{pupil}}`, `{{teachers}}`, `{{Group}}`, `{{org}}`, `{{period}}` and a `_school` context variant for school-only texts.

## Stack

TypeScript everywhere · React + Vite (frontend) · Node.js Lambdas on AWS (backend) · AWS SAM / CloudFormation · DynamoDB · Cognito · S3 + CloudFront · SES · EventBridge Scheduler. Region: EU (`eu-west-1`). Details and rationale: the skill and `docs/decisions.md`.

## Repository layout

The layout from the skill (section 3), with these domain areas:

```
apps/web/src/features/   catalog, manage (titles and copies), exchange, circulation (desk, loans, kiosk,
                         settings), readers, labels, statistics, staff, export, auth
services/api/src/        catalog, circulation, readers, staff (API functions); search-indexer, retention (jobs);
                         branding, export (used by the circulation function), exchange (used by the
                         catalog function); local/ (local dev server)
packages/shared/src/     one file per domain: auth, branding, catalog, circulation, exchange, export, isbn,
                         readers, search, staff
infra/                   template.yaml, samconfig.toml ([dev] and [prod])
scripts/                 build-api.mjs, deploy-web.sh, request-certificate.sh
docs/                    features.md, decisions.md
site/                    the product site at klasbak.itrw.be (static, own stack; site/README.md)
```

npm workspaces monorepo. Shared code goes in `packages/shared` only when used by both web and api.

## Commands

```bash
npm install                      # install all workspaces
npm run dev:local                # everything locally: DynamoDB Local + API (:3000) + frontend (:5173)
npm run seed                     # sample catalogue for local development
npm run demo                     # EMPTIES the local database and loads a demo school (keeps name and logo)
npm run dev                      # frontend only, against a deployed stack (VITE_PROXY_TARGET in apps/web/.env.local)
npm run typecheck && npm run lint && npm test
npm run build                    # build the frontend
npm run validate:infra           # sam validate --lint
npm run build:api                # bundle the Lambdas into services/api/dist (used by deploy)
npm run deploy:dev               # build:api + sam deploy of the dev stack (no `sam build`, see decision 014)
scripts/deploy-web.sh dev       # publish the frontend to the dev stack (name and logo: in the app)
scripts/setup-installation.sh <alarm email>      # once per AWS account, before the first deploy
scripts/create-admin.sh dev|prod <user> <email>  # first administrator (random temporary password)
scripts/request-certificate.sh klasbak.example.org   # own web address (see README)
scripts/status.sh dev|prod                       # how the installation is doing (docs/runbook.md)
```

The table's key design is documented in `services/api/src/lib/keys.ts`; keep it the single place for item keys.

Local development: the API runs as plain Hono apps on Node (`services/api/src/local/`). Keep Lambda handlers free of AWS-only assumptions so they keep working there; anything that writes public files goes through `lib/public-files.ts`.

## Users, roles and privacy

- **Personas**: the librarian at the desk with a queue of children; a pupil (often young) at the "Mijn boeken" screen; the school's administrator a few times a year; the class teacher handing out reminder slips; parents and pupils browsing the public catalogue on a phone.
- **Roles** (Cognito groups): `admin` (everything, including settings, staff accounts and the full export), `librarian` (desk, catalogue, readers, labels, statistics). `teacher` and `reader` exist for later; readers have no login yet (decision 013). Two-step verification is required for `admin` and `librarian`, enforced by the API.
- **Personal data collected**: readers' first and last name, class, category (pupil/teacher), card number, optional school number (stamboeknummer, only to recognise pupils in imports; never printed), optional email; their loans. No birth dates, addresses or photos. Staff: name, username, optional email, role.
- **Third parties** receive only ISBNs (book lookups); covers are stored on our own server, so visitors never contact them.
- **Statistics** are anonymous counters (month, title, class), never per pupil.
- **Privacy notice**: `/privacy`, in plain Dutch for parents and children. A data processing agreement (verwerkersovereenkomst) exists between the school and ITRW; keep the app consistent with what it promises (e.g. retention, MFA, dependency checks).
- **Region**: `eu-west-1`; one AWS account per installation (school) and one for testing.

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
