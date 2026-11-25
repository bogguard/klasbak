# Klasbak

[![CI](https://github.com/bogguard/klasbak/actions/workflows/ci.yml/badge.svg)](https://github.com/bogguard/klasbak/actions/workflows/ci.yml)
[![MIT licence](https://img.shields.io/badge/licence-MIT-0f6e66)](LICENSE)

Practical open-source tools for schools, starting with the school library: a public catalogue
with real covers, a lending desk with barcodes, readers, labels and reader cards, reminder slips
and anonymous statistics, imports from school administrations (Informat, Wisa, Smartschool) and
exchange collections from the public library. A second module keeps track of Chromebooks and other
equipment: what the school has and where it is. A third lets the school take its own school photos
(or have a photographer do it) and lets parents download the original files. More tools (lost and found,
maintenance requests, duty planning) are planned as modules of the same installation
([decision 036](docs/decisions.md), [roadmap](docs/features.md)). Dutch (Flemish) and English.
Serverless on AWS, one installation per school, data in the EU.

- **What it is and how to get started:** https://klasbak.itrw.be
- **See it work:** [a ten-minute tour](https://youtu.be/C4mgS-DkCsQ) (in Dutch)
- **Run it locally in a few minutes:** [Local development](#local-development) and
  [a demo library](#a-demo-library)

Found a security problem? See [SECURITY.md](SECURITY.md). Questions and ideas are welcome as
[issues](https://github.com/bogguard/klasbak/issues).

## Setting up a school (production)

Each school gets **its own AWS account**: its data, costs and access stay fully separate,
and one school's settings can never touch another's. Use a second account for testing (the
`dev` environment). Setting up a school takes about half an hour, most of it waiting for
AWS.

An own web address (e.g. `klasbak.example.org`) is optional. Without one, the library runs on an
address like `d1234abcd.cloudfront.net`; you can [add the school's address
later](#adding-the-schools-own-web-address) without losing anything.

### 1. A new AWS account (once per school)

1. Create the account, ideally under an AWS Organization (one invoice, central access). Use an
   address you control, e.g. `aws-<school>@your-domain.example`.
2. Secure the **root user**: turn on two-step verification (MFA), then stop using it.
3. Give yourself day-to-day access with two-step verification: IAM Identity Center (with
   Organizations) or an IAM user with MFA. Deploying needs broad rights
   (`AdministratorAccess`); the app itself runs with narrowly scoped roles.
4. Configure a CLI profile on your computer and switch off the pager for it:

   ```bash
   aws configure sso --profile klasbak-<school>     # or: aws configure --profile klasbak-<school>
   aws configure set cli_pager "" --profile klasbak-<school>
   ```

### 2. Prerequisites on your computer

- Node.js 24 (`nvm use`), then `npm install` in this folder
- AWS CLI v2 and AWS SAM CLI ≥ 1.150

### 3. Settings for the account

Run everything from the project folder, in one terminal:

```bash
export AWS_PROFILE=klasbak-<school>
scripts/setup-installation.sh replace-with-your-address@example.com <instellingsnummer>
```

This stores, in the account's Parameter Store (never in git): the address that receives alarms,
the school's **instellingsnummer** (six digits, from the Departement Onderwijs) and "no own web
address yet". Every barcode and reader card the app makes starts with the instellingsnummer, so
codes are unique across schools and a book from another school is recognised at the desk; it
can't change once labels are printed. To also look up books in Google Books (recommended, see
[Book data](#book-data-isbn-lookup)), put the key in front:
`GOOGLE_BOOKS_API_KEY=<key> scripts/setup-installation.sh <address> <instellingsnummer>`.

### 4. Deploy

```bash
npm run deploy:prod
```

It shows the changes and asks for confirmation (`y`). The first time takes 5–10 minutes, mostly
CloudFront. Then confirm the "AWS Notification – Subscription Confirmation" email, or alarms
won't arrive. The prod stack also sets a monthly budget alarm (`MonthlyBudgetUsd` in
`infra/samconfig.toml`, $25 by default).

### 5. Publish the website

```bash
scripts/deploy-web.sh prod
```

It prints the library's address.

### 6. The first administrator

```bash
scripts/create-admin.sh prod <username> <email>
```

It creates the account with a random temporary password, shown once. Pass it on in person or by
phone. At the first sign-in the app asks for a new password (at least 12 characters) and sets up
two-step verification with an authenticator app.

### 7. Hand over to the school

The administrator then, in the app:

- sets the school's name and logo (School → Instellingen → **School**), the loan rules and the days the
  library is closed (Instellingen);
- adds colleagues who run the library (School → **Medewerkers**);
- adds the readers, one by one or imported from a spreadsheet (School → Lezers → **Importeren**): the
  pupils from Informat, Wisa or Smartschool;
- prints reader cards and labels (**Labels**);
- switches on **Materiaal** and **Schoolfoto’s** if the school wants them (Instellingen →
  **Modules**).

### A test environment

The same steps in a separate account, with `dev` instead of `prod`:
`npm run deploy:dev`, `scripts/deploy-web.sh dev`, `scripts/create-admin.sh dev …`. The dev stack
is less strict: no deletion protection, shorter log retention, no budget alarm, no confirmation
before deploying.

### Updating an installation

After pulling a new version:

```bash
export AWS_PROFILE=klasbak-<school>
npm run deploy:prod
scripts/deploy-web.sh prod
```

Always deploy the backend first: the new website may use new API routes.

## Adding the school's own web address

Can be done at installation or any time later on a running library; data and accounts stay as
they are. Use a subdomain such as `klasbak.example.org`: the bare `example.org` can't point to
CloudFront with an ordinary DNS record. You need whoever manages the school's domain for two
DNS records.

1. **Request a certificate** (free, renews itself):

   ```bash
   export AWS_PROFILE=klasbak-<school>
   scripts/request-certificate.sh klasbak.example.org
   ```

   It shows the first DNS record (a CNAME that proves the address belongs to the school) and waits
   until AWS sees it: minutes, sometimes a few hours. If the window closes, run it again; it picks
   up where it left off. When it's done, it stores the address and certificate in the account.

   - The address must not point anywhere yet: the script stops if it already has a CNAME.
   - If the school's domain limits who may issue certificates (a CAA record), the script explains
     which record to add (`amazon.com`).

2. **Deploy**, so CloudFront answers on the new address:

   ```bash
   npm run deploy:prod
   ```

3. **Point the address to the library** with the second DNS record:
   `CNAME klasbak → <CloudFrontDomain>`, where `CloudFrontDomain` is printed by the deploy (or see
   `aws cloudformation describe-stacks --region eu-west-1 --stack-name klasbak-prod --query "Stacks[0].Outputs" --output table`).
   Most DNS panels want the name without the domain and the value without a dot at the end.

4. **Publish the website again**; it prints the new address:

   ```bash
   scripts/deploy-web.sh prod
   ```

The CloudFront address keeps working too. Keep the first DNS record in place: AWS needs it to
renew the certificate.

### Changing or removing the address

- **Another address:** run `scripts/request-certificate.sh` with the new one, then steps 2–4. The
  old CNAME can go once the new address works.
- **Back to the CloudFront address only:**

  ```bash
  aws ssm put-parameter --region eu-west-1 --name /klasbak/domain-name --type String --value none --overwrite
  aws ssm put-parameter --region eu-west-1 --name /klasbak/certificate-arn --type String --value none --overwrite
  npm run deploy:prod && scripts/deploy-web.sh prod
  ```

## Following up: alarms, logs and the dashboard

How to know the library is doing well, and what to do when it isn't, is in
[docs/runbook.md](docs/runbook.md). In short:

- **Alarms come by email** (the address from `setup-installation.sh`): server errors, a failing or
  missing nightly clean-up, search index problems, throttling, and (prod) the budget. Each alarm
  has a section in the runbook.
- **Weekly check:** `scripts/status.sh prod` prints the alarms, the last 24 hours (requests,
  errors, loans), whether the nightly job ran, the costs so far and the latest errors and warnings.
  It needs `jq`.
- **Dashboard:** CloudWatch → Dashboards → `klasbak-prod` (link in the stack output
  `DashboardUrl`), with ready-made searches under Logs Insights → Saved queries.
- **A user reports an error:** the app shows a reference ("referentie: abc12345") on unexpected
  errors; the saved query "Find an error by its reference" finds it.

## Book data (ISBN lookup)

Scanning an ISBN fills in the title, authors and cover from three free sources, in this order:
Open Library (good for English books), Google Books (needs an API key, see below) and the Dutch
public libraries' open catalogue, data.bibliotheken.nl (best for recent Dutch and Flemish books, but
without covers). Google Books only answers requests with an API key (free, 1,000 lookups per day):

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project.
2. Under _APIs & Services → Library_, enable the **Books API**.
3. Under _APIs & Services → Credentials_, create an **API key** and restrict it to the Books API.
4. Store it in your AWS account (encrypted, never in git):

   ```bash
   aws ssm put-parameter --region eu-west-1 --name /klasbak/google-books-api-key --type SecureString --value <key>
   ```

The API picks it up within an hour, or right away after a deploy. Without a key, Google Books is
skipped. Locally, set `GOOGLE_BOOKS_API_KEY` in the terminal before `npm run dev:local`.

## Running the library

- **Staff accounts** are managed by administrators in the app, under School → **Medewerkers**: add a
  colleague (the app shows a temporary password once, to pass on), change their role, give a new
  password, reset two-step verification after a lost or new phone, or deactivate the account.
- **Staff sign-in** requires two-step verification. The first sign-in shows a QR code for an
  authenticator app.
- **No administrator left who can sign in?** Create a new one with `scripts/create-admin.sh`
  (step 6 above). To reset someone's two-step verification from the CLI:

  ```bash
  aws cognito-idp admin-set-user-mfa-preference --region eu-west-1 --user-pool-id <UserPoolId> \
    --username <name> --software-token-mfa-settings Enabled=false,PreferredMfa=false
  ```

## Keeping track of equipment

Switched on in Instellingen → **Modules**; the menu then shows the section **Materiaal**. It is off by default,
and the API refuses requests while it is off. Give the ICT coordinator the role
_materiaalbeheerder_ (School → **Medewerkers**): they see this module and nothing of the library.

- **The overview**: per kind, how many there are and how many are free; below it every item with
  its place and status. Filter on a place or status, or search.
- **A delivery**: Materiaal toevoegen, fill in what the items share, then scan or paste the serial
  numbers, up to 200 at a time. A serial number that's already known is skipped, so pasting a list
  twice is safe. Items without one (chargers) are added as a quantity.
- **Labels**: new items wait under **Labels** on the Materiaal page, on the same sheets as books.
- **Finding an item**: scan its label or the manufacturer's sticker in the search box.
- **Checking a place**: filter on it (say Kar A) and compare the list with what's there. On the
  item, set what's gone to _Vermist_ and correct the place of what has moved.
- **Handing out** is optional, for a device that goes home with someone: open the item, scan the
  card or search for the reader, optionally set a date. Taking back asks whether it returns fine,
  needs repair or is missing. A school that only keeps stock never needs this.
- **Privacy**: who had what shows on the reader's page, is part of the export and the erasure, and
  is deleted after the retention period for reading history. See
  [decision 039](docs/decisions.md).

## School photos

Switched on in Instellingen → **Modules**; the menu then shows the section **Schoolfoto’s**. Off by default.
Give the photographer (someone of the school, or one the school hires) the role _fotograaf_
(School → **Medewerkers**): they upload and sort photos and see nothing else. Opening the photos to
parents, who may not be photographed and the download codes are for administrators. See
[decision 040](docs/decisions.md).

- **A photo day**: an administrator creates one (name and date).
- **Taking the photos**: for each pupil, first a photo of their pupil card, or of their line on the
  class list (Afdrukken → **Klaslijst**, with a barcode per pupil, alternately left and right), then
  the portraits. For the class photo, first photograph the class photo code at the top of the list.
  When a photo shows several barcodes, the one in the middle counts. Class photos can also be
  uploaded per class.
- **Uploading**: Foto’s opladen, and choose the whole memory card. The browser sorts the photos by
  the camera’s time, reads the cards, removes location and camera details (EXIF, GPS) without
  re-compressing, makes a screen version, and uploads straight to a private S3 bucket. Photos it
  couldn’t place wait under _Nog niet toegewezen_.
- **Sorting**: per class, every pupil with their photos; click a photo to give it to someone else
  or delete it. Pupils without a photo are listed for a catch-up moment.
- **For parents**: pick until when they can download (30 days by default, at the latest 31 August,
  the end of the school year), open the photo day and print the slips (eight per A4) for the class
  teachers. A slip has a personal code and a QR code to `/fotos`; parents see their child’s
  portraits and class photo and download the originals. A lost slip: **Nieuwe code** on the pupil.
- **Privacy**: everything of a photo day (files, codes, entries) is deleted the night after its last
  day, or the night after the school deletes it; erasing a reader erases their photos.

## Local development

Everything runs on your machine; no AWS account is needed. Requires Docker Desktop.

```bash
npm install
npm run dev:local   # DynamoDB Local (Docker) + local API on :3000 + frontend on http://localhost:5173
npm run seed        # once, in a second terminal: a small sample catalogue
```

The local API runs the same code as the Lambdas. A small server
([services/api/src/local/server.ts](services/api/src/local/server.ts)) stands in for the AWS parts:

| On AWS                                  | Locally                                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Cognito sign-in + API Gateway JWT check | Dev sign-in: header `Authorization: Dev librarian` (or `admin`, `equipment`, `photographer`, `teacher`, `reader`) |
| DynamoDB                                | DynamoDB Local in Docker (data kept in a Docker volume)                                                           |
| DynamoDB stream → search indexer Lambda | Index rebuilt right after each change                                                                             |
| S3 + CloudFront for covers and search   | Files in `.local/public`, served by the local server                                                              |
| Photos bucket with signed links         | Files in `.local/photos`, uploaded and served at `/local-photos` by the local server                              |

To work on the frontend against a deployed dev stack instead, put its `AppUrl` in
`apps/web/.env.local` (see `.env.example`) and run `npm run dev`.

### A demo library

For a demo or screenshots, fill the local app with a school library in use since last spring. The
dates follow the current school year, so the demo never looks old. Keep `npm run dev:local` running
and, in a second terminal:

```bash
npm run demo
```

This **empties the local database** first; the school's name and logo (Instellingen →
School) are kept. It refuses to run against AWS. Then it loads:

- a catalogue of real children's books with their covers (looked up by ISBN, so an internet
  connection helps; offline the covers are generated), added over the last year;
- classes of pupils and a few teachers, all with made-up names, and one inactive reader;
- loans since last March up to today, a few of them overdue now, so the statistics, the overdue
  list and the reminder slips have something to show;
- Chromebooks, tablets and chargers (one late, one in repair, one missing, some awaiting a label);
- a photo day without photos yet (try uploading your own), with one pupil who may not be
  photographed;
- a few damaged, missing and withdrawn copies, books waiting for a label, two exchange collections
  from the public library (in use until their return date, then returned with their book list) and
  the school holidays as closed days.

Open http://localhost:5173, choose **Aanmelden** and sign in as a role (no password locally):
**beheerder** (admin) sees everything, including Instellingen; **bibliothecaris** (librarian) the
desk, catalogue, readers, statistics and equipment; **materiaalbeheerder** (equipment) only the
equipment; **fotograaf** (photographer) only the school photos. Run `npm run demo` again to start from a clean demo; after
`docker compose down -v` the database is empty. To see the demo as on another day (e.g. to check a
change in another season), run `DEMO_TODAY=2027-05-20 npm run demo`.

## Product site

The public page about the project, https://klasbak.itrw.be (what it is, the webinar, the price, how
to start), lives in [`site/`](site/README.md): a static site in Dutch and English with its own
small stack. `npm run build:site` builds it, `npm run deploy:site` publishes it.

## Quality checks (also run in CI)

```bash
npm run typecheck && npm run lint && npm test && npm run validate:infra
```

## Costs

At the scale of a school the stack stays mostly within the AWS free tier.
Expect a few euros per month, mainly CloudWatch and S3/CloudFront. There are no always-on resources
(no NAT, no databases with minimum capacity, no OpenSearch). A budget alarm (`MonthlyBudgetUsd`)
warns you before surprises.
