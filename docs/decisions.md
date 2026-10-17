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
- **Decision**: The web app builds PDFs with jsPDF (loaded only on the labels page) in millimetres for known sheet layouts (Avery L7651, L7159, L7160, Zweckform 3474) and credit-card-size reader cards, 10 per A4, butted together with crop marks in the margin (for a paper cutter, then laminating) and without the class, which changes every school year. Barcodes are Code 128, encoded by JsBarcode's encoder (rather than our own copy of the encoding table) and drawn as vector bars. People can start on a partly used sheet and nudge the alignment by a few millimetres (remembered per computer). Book labels carry the school's name next to the number (and its logo on labels of 30 mm and higher), so a lost book can be returned; the barcode keeps its full height.
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

## 020 — Browse the catalogue, with availability in the search index

- **Context**: Visitors want to scroll through the collection and see what's on the shelf, not only search.
- **Decision**: With no search words, the catalogue lists every title (newest first by default, which also serves as "new acquisitions"; or A–Z by title or author), loading more while scrolling. The search index stores each title's number of visible copies and available copies and the date it was added, and is now rebuilt when copies change too (stream filter on `TITLE` and `COPY#` keys), so loans and returns update availability.
- **Consequences**: During busy desk hours the index is rebuilt about once a minute (batched), a full table read that costs a fraction of a cent at school scale. Availability in lists can lag a minute or two; the title page shows the live status.

## 021 — Administrators manage staff accounts in the app

- **Decision**: A "Medewerkers" page (admins only, enforced by the API) lists the Cognito users in the `admin` and `librarian` groups and lets admins create accounts, change roles, issue a new temporary password, reset two-step verification and deactivate or reactivate accounts (deactivating also signs them out everywhere). New accounts get a generated temporary password (no look-alike characters) that is shown once to the admin; Cognito sends no email. Nobody can change their own account there, and the last active admin can't be demoted or deactivated. Changes are written to the audit trail. Locally an in-memory list stands in for Cognito.
- **Consequences**: No email setup needed and no passwords in mailboxes; the admin passes the password on in person. The staff function has its own narrowly scoped Cognito permissions. Beheerder vs bibliothecaris now differ in one place (staff management); splitting other admin-only tasks is still open.

## 022 — Search index updates within seconds

- **Context**: New books showed up in search only after a minute or more, which confused staff: the stream waited up to 60 s, the index was cached for 60 s, and the app kept its copy for 5 minutes.
- **Decision**: No batching window on the stream (changes during a rebuild still coalesce into the next one), `Cache-Control: no-cache` on the index (revalidated each time, a cheap 304 when unchanged), and after a staff change the app puts the fresh title straight into its own copy of the index.
- **Consequences**: Staff see their change immediately; visitors within seconds. During busy desk hours the index is rebuilt more often, still a fraction of a cent per day at school scale.

## 023 — A print queue for barcode labels

- **Context**: Labels were printed per title or by barcode range, which wastes label sheets and means remembering numbers.
- **Decision**: Copies with a generated barcode are marked `labelPending` and listed in a sparse index (`gsi1`: `LABELS#PENDING` / barcode); typed barcodes are assumed to have a sticker already. The labels page prints the whole queue in one PDF, then asks whether it printed correctly; only on "yes" are the copies taken off the queue and the next free position on the sheet is remembered per sheet type (on that computer). All copy writes go through one item builder, so edits keep the index entry.
- **Consequences**: One sheet for a whole batch of new books, no counting. A failed print loses nothing.

## 024 — Administrator-only tasks, and scanning with a camera

- **Roles**: library settings (loan rules, holidays, retention), CSV import of readers, deleting or exporting a reader, and staff accounts are for administrators; the API refuses librarians (403) and the screens hide these actions. Daily work (catalogue, desk, readers, labels) stays open to librarians.
- **Camera scanning**: desks without a barcode scanner can use the device camera. The browser's own BarcodeDetector is used where available; otherwise the `barcode-detector` ponyfill with ZXing WebAssembly, bundled and served from our own site (no CDN), which needs `'wasm-unsafe-eval'` in the CSP. The desk reads only Code 128 (our labels and cards), so the ISBN on a book's back is ignored; adding books reads only EAN-13 (ISBN). The camera needs HTTPS, which CloudFront provides (and localhost for development).
- **At the desk the camera runs inside the page** (not full screen), so the result of each scan and the reader stay visible while scanning a card and a stack of books; the button next to the scan field switches it on and off, and it stops when the desk clears itself. A code counts again only after it has left the view, so a book left in front of the camera is never returned and lent again. Adding a title and "Mijn boeken" keep the full-screen camera that closes after one code.
- **Consequences**: About 460 kB extra download, only when the camera is opened in a browser without built-in detection. `zxing-wasm` is pinned to the version `barcode-detector` uses.

## 025 — Visual identity and the school's own branding

- **Design**: A warm "paper" palette instead of neutral greys, Fraunces for headings and Nunito for text (both open-source and served from our own site, not Google Fonts), and a cover-first catalogue: a grid of covers with filter chips. Titles without a cover get a generated cloth-style cover in one of eight colours (same title, same colour) with the title in the display face, so the catalogue never looks empty.
- **Branding**: Administrators set the library's name and upload the school logo (PNG/JPEG/WebP, max 1 MB, scaled to 512 px PNG in the browser; SVG refused because it can carry scripts). Stored as `SETTINGS/BRANDING` and published as `branding/branding.json` (no-cache) plus an immutable logo file, so pages read it without an API call. Shown in the header, as the browser tab icon and on reader cards.
- **Consequences**: About 60 kB of fonts (cached long-term). The name in `config.json` from the deploy script is now only a fallback.

## 026 — The school's own web address

- **Context**: A `*.cloudfront.net` address looks untrustworthy to parents and staff. CloudFront needs a certificate from ACM in us-east-1 for any other address, and school domains are rarely managed in Route 53.
- **Decision**: The template takes the address and certificate ARN from Parameter Store (`/library/domain-name`, `/library/certificate-arn`; `none` = CloudFront address) and sets the distribution's alias and certificate only when both are set. `scripts/request-certificate.sh` requests a DNS-validated certificate in us-east-1, prints the one validation record for the school's DNS, waits for it and stores both settings. The `AppUrl` output switches to the own address; `CloudFrontDomain` is what the school's CNAME points to.
- **Consequences**: No school details in the repository, works with any DNS provider, certificates renew automatically while the validation record stays in place. Every installation needs the two parameters (`none` is fine).

## 027 — Full data export for the school

- **Context**: The data processing agreement promises the school a complete copy of its data at the end of the service, and schools ask "can we take our data elsewhere?".
- **Decision**: Administrators export everything from Instellingen: `GET /api/circulation/export` returns the school's records (titles, copies, readers, loans, settings; not counters, code pointers, audit or statistics) one DynamoDB scan page at a time with an opaque cursor, so every response stays under Lambda's 6 MB limit. The browser builds a ZIP (fflate, loaded on demand) with one CSV per kind (semicolons and a byte-order mark for Belgian Excel) plus everything as JSON. Each export is written to the audit trail.
- **Consequences**: Works at any library size without temporary files in S3. The export contains personal data, which the page says plainly.

## 028 — Reminder slips, a "Mijn boeken" screen and anonymous statistics

- **Context**: The first school asked for reminders after three weeks, for pupils to see their own loans, and for statistics on what is read. Most pupils have no email address, and the data processing agreement promises no profiling of children.
- **Decision**: Reminders are printed slips (PDF in the browser, three per A4, one per reader with all their late books), made from the overdue list and its class filter, for the class teacher to hand out. "Mijn boeken" (`/kiosk`) is a full-screen page on a library device signed in by staff: a pupil scans their card and sees their first name, books and due dates (`POST /api/circulation/my-books`, read-only) and the screen clears after 20 seconds. Statistics are anonymous counters (`STATS#<yyyy-mm>`: total, per title, per class for pupils) added in the check-out transaction itself; the retention job now only deletes old history. `GET /api/circulation/statistics` adds up at most 24 months; the page joins title ids with the search index for names, covers and "not lent" titles. No figures per pupil.
- **Consequences**: No email setup or pupil accounts needed. Counters never drift from loans (same transaction) and don't depend on history being kept. Loans made before this change are counted only if the old retention job counted them. The kiosk runs with a librarian's session, so the device must stay in sight of the library; a dedicated kiosk account would remove that need later. Email reminders (to teachers) can be added on top.

## 029 — A loan ticket printed by the browser

- **Context**: Librarians want to hand pupils a slip with their books and due dates.
- **Decision**: The desk's reader panel has "Ticket afdrukken": the browser prints a 72 mm wide ticket (name, class, all current books by due date, late ones marked) while the rest of the app is hidden with a print-only class. No PDF, no printer driver or server: it fits an 80 mm receipt printer and prints at the top of A4 on a normal printer.
- **Consequences**: The print dialog appears each time; Chrome started with `--kiosk-printing` prints straight to the default printer. Printing is never automatic, so no paper is wasted on pupils who don't need a ticket.

## 030 — Importing from school administration software, a new school year, and the report

- **Context**: Schools run Informat, Wisa or Smartschool and get their pupil lists from there as Excel files; every September classes change and pupils leave. Municipalities and public libraries (e.g. in a "Bib op school" partnership) ask schools for figures.
- **Decision**: The reader import reads `.xlsx` directly (a small reader on top of fflate, first sheet only; old `.xls` asks to save as `.xlsx` or CSV) as well as CSV, finds the header below title rows, and recognises the usual Dutch column names (`stamboeknummer`/`stamnummer`, `naam`, `voornaam`, `klasgroep`…). Readers get an optional `schoolNumber` (the administration's number), used only to recognise them in later imports; the card number stays the library's own, so cards survive a change of administration software and the school number is never printed. `matchReader` (shared by preview and server) matches by school number, then card number, then a unique exact name among readers without a school number (readers entered by hand before the first import); it never guesses between two readers with the same name. On update, fields the file doesn't have keep their value. The preview shows new/updated rows and the active pupils missing from the file, with an opt-in to set them inactive (the new school year). The Statistieken page doubles as the report: print (or save as PDF) with a header naming the school, year and date, or download one CSV (section; item; count), with collection size, new titles, active readers and loans per AVI level added.
- **Consequences**: No integration with the administration software to maintain; the school exports a list once a year. The school number is extra personal data, listed in `CLAUDE.md` and to be added to the data processing agreement.

## 031 — Exchange collections from the public library

- **Context**: Public libraries lend schools collections of books for a few months ("wisselcollecties", e.g. within "Bib op school") and can no longer manage them in their own system. Schools need to lend them like their own books, keep them apart, and send them back complete; the library wants to know how they were used.
- **Decision**: An exchange collection (`EXCHANGE/<id>`: lender, name, return date, status, loan counter) owns copies that carry its id (`exchangeId`, indexed in `gsi1` as `EXCHANGE#<id>`, since they never wait for a label). Books keep the library's barcode: added by scanning the ISBN and then the library label, or by reading in the library's list (Excel or CSV: barcode plus title and/or ISBN, author, AVI); titles already in the catalogue are reused, new ones are marked with the collection. At the desk they are lent as usual, but the due date is capped at a week before the collection goes back (moved to an open day), and each loan adds to the collection's counter in the same transaction. Every copy counts its own loans (`loanCount`, added in the check-out transaction). Returning the collection is refused while books are out; it first saves the list of its books (title, authors, ISBN, AVI, library barcode, times lent; no personal data) on the collection, then removes the copies and their barcodes (the library may send the same books again) and titles made only for the collection, and keeps the collection with its final counts. Routes live in the catalogue function (`/api/catalog/exchanges`). Statistics and the report list the collections of the school year with their loans.
- **Consequences**: No new Lambda or infrastructure. Loans of exchange books stay in the readers' history until the retention period (titles as snapshots). The library's barcodes must not clash with the school's own codes; a clash is reported per book. Statistics stay right after a collection goes back: the loan counters also keep the title's name and count the AVI level at loan time (`AVI#<level>`), and the search index tells how many of a title's copies are exchange copies, so the collection size, new titles and "not lent" cover the school's own books only.
