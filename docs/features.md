# Features & roadmap

Features a school library needs, from cataloguing to lending to reading promotion. We ship in phases; each phase is usable on its own.

## Status

| Area                                                                       | State                          |
| -------------------------------------------------------------------------- | ------------------------------ |
| Catalogue API: titles, copies, barcodes, ISBN lookup, covers, audit        | Built and tested; runs locally |
| Public catalogue: search (in browser) and title page                       | Built; runs locally            |
| Sign-in (Cognito, or dev roles locally) and staff "Beheer" screens         | Built; tested on AWS (dev)     |
| Readers: list, add/edit, CSV import                                        | Built; runs locally            |
| Lending desk, overdue/loan lists (printable), loan rules and closed days   | Built and tested; runs locally |
| Barcode labels and reader cards (PDF)                                      | Built; runs locally            |
| Staff two-step verification, privacy page, history retention, erasure      | Built; runs locally            |
| Reminder slips, "Mijn boeken" screen, anonymous statistics                 | Built; runs locally            |
| Loan ticket at the desk (browser print, receipt or A4)                     | Built; runs locally            |
| Import from Informat/Wisa/Smartschool (xlsx, CSV), new school year, report | Built; runs locally            |

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
