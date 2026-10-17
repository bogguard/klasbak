# Library App

[MIT licence](LICENSE)

School library software: public catalogue, circulation desk, reader portal. Serverless on AWS.
Start with [CLAUDE.md](CLAUDE.md) (overview, commands, glossary), [docs/features.md](docs/features.md)
(roadmap and status) and [docs/decisions.md](docs/decisions.md) (why things are the way they are).

## Prerequisites

- Node.js 24 (`nvm use`)
- AWS SAM CLI ≥ 1.150 and AWS CLI v2, credentials for the target account
- An EU region (default `eu-west-1`)

## First deploy

Run from the project folder, in one terminal session:

1. Choose the AWS profile and check it:

   ```bash
   export AWS_PROFILE=<your-profile>
   aws sts get-caller-identity
   ```

2. Store the installation's settings, once per AWS account (they stay out of git): the address
   that receives alarms, and the web address (`none` for now; see "Own web address" below):

   ```bash
   aws ssm put-parameter --region eu-west-1 --name /library/alarm-email --type String --value you@example.com
   aws ssm put-parameter --region eu-west-1 --name /library/domain-name --type String --value none
   aws ssm put-parameter --region eu-west-1 --name /library/certificate-arn --type String --value none
   ```

3. Deploy the backend and infrastructure (5–10 minutes the first time, mostly CloudFront):

   ```bash
   npm run deploy:dev
   ```

   Confirm the "AWS Notification – Subscription Confirmation" email, or alarms won't arrive.
   Optionally adjust the prod budget (`MonthlyBudgetUsd`) in `infra/samconfig.toml`.

4. Publish the website; it prints the app URL:

   ```bash
   scripts/deploy-web.sh dev
   ```

   The library's name and logo are set later in the app, under Instellingen → Huisstijl.

5. Create the first admin. Find the `UserPoolId` with
   `aws cloudformation describe-stacks --region eu-west-1 --stack-name library-dev --query "Stacks[0].Outputs" --output table`:

   ```bash
   aws cognito-idp admin-create-user --region eu-west-1 --user-pool-id <UserPoolId> \
     --username <name> --temporary-password '<temporary password>' --message-action SUPPRESS \
     --user-attributes Name=email,Value=<email> Name=email_verified,Value=true
   aws cognito-idp admin-add-user-to-group --region eu-west-1 --user-pool-id <UserPoolId> \
     --username <name> --group-name admin
   ```

   At the first sign-in the app asks for a new password.

## Own web address

By default the library lives at an address like `d1234abcd.cloudfront.net`. To use the school's
own address, e.g. `bib.schoolnaam.be` (a subdomain: the bare `schoolnaam.be` can't point to
CloudFront with a normal DNS record):

1. `scripts/request-certificate.sh bib.schoolnaam.be` requests a free certificate and shows one DNS
   record for whoever manages the school's domain. It waits until AWS sees that record, then stores
   the settings.
2. `npm run deploy:dev` (or `deploy:prod`).
3. Add a second DNS record: `CNAME bib.schoolnaam.be → <CloudFrontDomain output>`.
4. `scripts/deploy-web.sh dev`; it prints the new address.

To go back to the CloudFront address, set both `/library/domain-name` and
`/library/certificate-arn` to `none` and deploy.

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
- **No administrator left who can sign in?** Use the CLI (step 5 under "First deploy" creates a new
  admin). To reset someone's two-step verification from the CLI:

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

At school scale the stack stays mostly within the AWS free tier. Expect a few euros per month,
mainly CloudWatch and S3/CloudFront. There are no always-on resources (no NAT, no databases with
minimum capacity, no OpenSearch). A budget alarm (`MonthlyBudgetUsd`) warns you before surprises.
