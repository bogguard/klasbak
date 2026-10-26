# Features & roadmap

Features a school library needs, from cataloguing to lending to reading promotion. We ship in phases; each phase is usable on its own.

## Status

| Area                                                                       | State                         |
| -------------------------------------------------------------------------- | ----------------------------- |
| Catalogue API: titles, copies, barcodes, ISBN lookup, covers, audit        | Built and tested; runs on AWS |
| Public catalogue: search (in browser) and title page                       | Built; runs on AWS            |
| Sign-in (Cognito, or dev roles locally) and staff "Beheer" screens         | Built; tested on AWS (dev)    |
| Readers: list, add/edit, CSV import                                        | Built; runs on AWS            |
| Lending desk, overdue/loan lists (printable), loan rules and closed days   | Built and tested; runs on AWS |
| Barcode labels and reader cards (PDF)                                      | Built; runs on AWS            |
| Staff two-step verification, privacy page, history retention, erasure      | Built; runs on AWS            |
| Reminder slips, "Mijn boeken" screen, anonymous statistics                 | Built; runs on AWS            |
| Loan ticket at the desk (browser print, receipt or A4)                     | Built; runs on AWS            |
| Import from Informat/Wisa/Smartschool (xlsx, CSV), new school year, report | Built; runs on AWS            |
| Exchange collections from the public library (decision 031)                | Built; runs on AWS            |
| Demo library for local development (`npm run demo`)                        | Built                         |

## Phase 1 — MVP: run a school library

**Catalogue (staff)**

- Create/edit titles: type (book, magazine, audio, video, game, score, other), title, authors, publisher, year, ISBN, language, subjects/tags, summary, cover image, reading level (AVI/ZIZO), age range.
- ISBN lookup: scan or type an ISBN → fetch metadata + cover from open sources (Open Library, Google Books); manual entry as fallback.
- Copies: barcode, collection/location, status (available, on loan, lost, damaged, withdrawn), acquisition date.
- Collections (sub-collections per campus or class library).
- Barcode label printing (PDF for standard label sheets).

**Readers**

- Readers with member number, name, group/class, role (pupil/teacher/staff), optional email.
- CSV import (e.g. export from Smartschool or the school administration), with preview and dry-run.
- Reader cards with barcode (printable PDF).
- School-year rollover: move classes up, deactivate leavers.

**Circulation desk**

- Check-out and check-in with a barcode scanner (keyboard-only flow).
- Loan policies per reader role and title type: loan period, max items, renewals.
- Due dates respecting closed days and holidays.
- Overview of current and overdue loans; filter by class.

**Public catalogue (OPAC)**

- Fast search with filters (type, reading level, age, availability, collection).
- Title detail page with availability per copy.
- Mobile-friendly; Dutch UI, English optional.

**Platform**

- Roles: admin, librarian, teacher, reader. Staff MFA.
- Audit log of important actions.
- Settings: library name, logo, opening hours, closed days, loan policies.

## Phase 2 — Readers & engagement

- Reader portal: login, own loans and history, renew online.
- Reservations with queue and notification when available (email; on-screen for readers without email).
- Overdue reminders: printed slips per pupil (built, decision 028); email to teachers later.
- ~~Fines~~ — not planned for now (decision 007).
- New acquisitions, theme lists, popular subjects on the homepage.
- Statistics: loans per month and class, most popular and never-lent titles (built, decision 028); CSV export later. Aggregated only.

## Phase 3 — Nice to have

- Selfscan kiosk mode: pupils scan their card and books themselves.
- Reviews/ratings by readers (moderated).
- News/announcements on the homepage.
- Reading promotion: reading challenges, recommendations by theme and reading level.
- Teacher features: class loans (box of books to a classroom), class overview.
- REST API with API keys for integrations; Smartschool SSO.
- Import from existing systems (CSV/MARC) — not needed for the first school (decision 007).
- Inventory mode (scan the shelves, report missing copies).

## Beyond the library — modules (decision 036)

Other school tools on the same installation, each switched on per school. Order: equipment lending, lost and found, maintenance requests, duty planning.

### Module 1 — Equipment lending (`equipment`, UI "Materiaal")

Laptops, tablets, cameras, calculators, sports gear: lent to a pupil or teacher, often for a day or a lesson.

**Version 1: lend and return at a desk**

- Equipment items (`Asset`): name, kind (laptop, tablet…), barcode, optional serial number, location, status (available, on loan, in repair, withdrawn), notes on condition. Not in the public catalogue or search index.
- Barcodes in the existing code namespace (011, a new pointer kind `asset`), so the same scanner and label printing work and a scanned code still means one thing.
- Lending reuses the reader, the loan and the "one active loan" condition (012): a loan points to a copy or an asset. A teacher's reminder slip then shows late books and late equipment together.
- Loan periods per kind of equipment, in days, with "back today" (due at the end of the school day) as the common case; due dates skip closed days as for books.
- Return asks for a condition note when something is wrong, and can set the item to "in repair" in one step.
- Lend to a group: one loan per item to the teacher, for a class set (e.g. 25 tablets for one lesson).
- Overdue list and reminder slips as in the library, filtered by module.
- Who manages equipment: a role per module (`equipment`), so the ICT coordinator doesn't need library rights.

**Version 2: booking**

- Teachers book a set or item for a date and lesson period ("laptop cart, Tuesday 2nd period"); conflicts are refused in the database. Needs teacher logins (013) and the school's lesson periods as a setting.

**Open questions**

- Where loans live: in the same `LOAN#` items with an `assetId` (one overdue list and history) or in their own items (no change to the library's queries). Leaning towards the first; to be settled in the design step with the access patterns.
- Statistics for equipment (use per kind and month) or none.
- Liability for damage: stays outside the app (no fines, decision 007).
