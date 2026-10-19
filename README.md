# Library App

[MIT licence](LICENSE)

Library software for any organisation with its own collection: a school, a law firm, a company's
documentation centre, an association. A public or internal catalogue, a lending desk with barcodes,
readers, labels and cards, statistics. Serverless on AWS, one installation per organisation.

It was built first for school libraries, but works for any organisation with a small library, such
as a law firm, a company or an association. Under Beheer → Instellingen an administrator chooses the
kind of library:

- **School**: pupils, teachers and classes; statistics per school year; imports from school
  administrations (Informat, Wisa, Smartschool) and exchange collections from the public library.
- **Other organisation**: readers, staff members and departments; statistics per calendar year; no
  exchange collections. Readers can be imported from any spreadsheet (e.g. a staff list).

The library can also choose its own words for its two kinds of readers (each with their own loan
rules) and their groups, e.g. "advocaat" and "stagiair" with "team". Groups and reading levels (AVI)
stay optional.

## Setting up an organisation (production)

Each organisation gets **its own AWS account**: its data, costs and access stay fully separate,
and one organisation's settings can never touch another's. Use a second account for testing (the
`dev` environment). Setting up an organisation takes about half an hour, most of it waiting for
AWS.

An own web address (e.g. `bib.example.org`) is optional. Without one, the library runs on an
address like `d1234abcd.cloudfront.net`; you can [add the organisation's address
later](#adding-the-organisations-own-web-address) without losing anything.

### 1. A new AWS account (once per organisation)

1. Create the account, ideally under an AWS Organization (one invoice, central access). Use an
   address you control, e.g. `aws-<organisation>@your-domain.example`.
2. Secure the **root user**: turn on two-step verification (MFA), then stop using it.
3. Give yourself day-to-day access with two-step verification: IAM Identity Center (with
   Organizations) or an IAM user with MFA. Deploying needs broad rights
   (`AdministratorAccess`); the app itself runs with narrowly scoped roles.
4. Configure a CLI profile on your computer and switch off the pager for it:

   ```bash
   aws configure sso --profile library-<organisation>     # or: aws configure --profile library-<organisation>
   aws configure set cli_pager "" --profile library-<organisation>
   ```

### 2. Prerequisites on your computer

- Node.js 24 (`nvm use`), then `npm install` in this folder
- AWS CLI v2 and AWS SAM CLI ≥ 1.150

### 3. Settings for the account

Run everything from the project folder, in one terminal:

```bash
export AWS_PROFILE=library-<organisation>
scripts/setup-installation.sh replace-with-your-address@example.com
```

This stores, in the account's Parameter Store (never in git): the address that receives alarms,
and "no own web address yet". To also look up books in Google Books (recommended, see
[Book data](#book-data-isbn-lookup)), put the key in front:
`GOOGLE_BOOKS_API_KEY=<key> scripts/setup-installation.sh replace-with-your-address@example.com`.

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

### 7. Hand over to the organisation

The administrator then, in the app:

- sets the library's name and logo (Instellingen → **Bibliotheek**), the loan rules and the days the
  library is closed (Instellingen);
- adds colleagues who run the library (Beheer → **Medewerkers**);
- adds the readers, one by one or imported from a spreadsheet (Lezers → **Importeren**): a list of
  employees, members or, in a school, the pupils from Informat, Wisa or Smartschool;
- prints reader cards and labels (**Labels**).

### A test environment

The same steps in a separate account, with `dev` instead of `prod`:
`npm run deploy:dev`, `scripts/deploy-web.sh dev`, `scripts/create-admin.sh dev …`. The dev stack
is less strict: no deletion protection, shorter log retention, no budget alarm, no confirmation
before deploying.

### Updating an installation

After pulling a new version:

```bash
export AWS_PROFILE=library-<organisation>
npm run deploy:prod
scripts/deploy-web.sh prod
```

Always deploy the backend first: the new website may use new API routes.

## Adding the organisation's own web address

Can be done at installation or any time later on a running library; data and accounts stay as
they are. Use a subdomain such as `bib.example.org`: the bare `example.org` can't point to
CloudFront with an ordinary DNS record. You need whoever manages the organisation's domain for two
DNS records.

1. **Request a certificate** (free, renews itself):

   ```bash
   export AWS_PROFILE=library-<organisation>
   scripts/request-certificate.sh bib.example.org
   ```

   It shows the first DNS record (a CNAME that proves the address belongs to the organisation) and waits
   until AWS sees it: minutes, sometimes a few hours. If the window closes, run it again; it picks
   up where it left off. When it's done, it stores the address and certificate in the account.

   - The address must not point anywhere yet: the script stops if it already has a CNAME.
   - If the organisation's domain limits who may issue certificates (a CAA record), the script explains
     which record to add (`amazon.com`).

2. **Deploy**, so CloudFront answers on the new address:

   ```bash
   npm run deploy:prod
   ```

3. **Point the address to the library** with the second DNS record:
   `CNAME bib → <CloudFrontDomain>`, where `CloudFrontDomain` is printed by the deploy (or see
   `aws cloudformation describe-stacks --region eu-west-1 --stack-name library-prod --query "Stacks[0].Outputs" --output table`).
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
  aws ssm put-parameter --region eu-west-1 --name /library/domain-name --type String --value none --overwrite
  aws ssm put-parameter --region eu-west-1 --name /library/certificate-arn --type String --value none --overwrite
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
- **Dashboard:** CloudWatch → Dashboards → `library-prod` (link in the stack output
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
   aws ssm put-parameter --region eu-west-1 --name /library/google-books-api-key --type SecureString --value <key>
   ```

The API picks it up within an hour, or right away after a deploy. Without a key, Google Books is
skipped. Locally, set `GOOGLE_BOOKS_API_KEY` in the terminal before `npm run dev:local`.

## Running the library

- **Staff accounts** are managed by administrators in the app, under Beheer → **Medewerkers**: add a
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

## Local development

Everything runs on your machine; no AWS account is needed. Requires Docker Desktop.

```bash
npm install
npm run dev:local   # DynamoDB Local (Docker) + local API on :3000 + frontend on http://localhost:5173
npm run seed        # once, in a second terminal: sample catalogue
```

The local API runs the same code as the Lambdas. A small server
([services/api/src/local/server.ts](services/api/src/local/server.ts)) stands in for the AWS parts:

| On AWS                                  | Locally                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| Cognito sign-in + API Gateway JWT check | Dev sign-in: header `Authorization: Dev librarian` (or `admin`, `teacher`, `reader`) |
| DynamoDB                                | DynamoDB Local in Docker (data kept in a Docker volume)                              |
| DynamoDB stream → search indexer Lambda | Index rebuilt right after each change                                                |
| S3 + CloudFront for covers and search   | Files in `.local/public`, served by the local server                                 |

Start over with an empty database: `docker compose down -v`.

To work on the frontend against a deployed dev stack instead, put its `AppUrl` in
`apps/web/.env.local` (see `.env.example`) and run `npm run dev`.

## Quality checks (also run in CI)

```bash
npm run typecheck && npm run lint && npm test && npm run validate:infra
```

## Costs

At the scale of a school or office library the stack stays mostly within the AWS free tier.
Expect a few euros per month, mainly CloudWatch and S3/CloudFront. There are no always-on resources
(no NAT, no databases with minimum capacity, no OpenSearch). A budget alarm (`MonthlyBudgetUsd`)
warns you before surprises.
