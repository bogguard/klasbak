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

1. Store the address that receives alarms, once per AWS account (it stays out of git):

   ```bash
   aws ssm put-parameter --region eu-west-1 --name /library/alarm-email --type String --value you@example.com
   ```

   Optionally adjust the prod budget (`MonthlyBudgetUsd`) in `infra/samconfig.toml`.

2. `npm install`
3. `npm run deploy:dev`, then confirm the SNS subscription email you receive.
4. `scripts/deploy-web.sh dev "Bib De Regenboog"`, which prints the app URL.
5. Create the first staff user:

   ```bash
   aws cognito-idp admin-create-user --user-pool-id <UserPoolId> --username juf.an \
     --user-attributes Name=email,Value=an@school.be Name=email_verified,Value=true
   aws cognito-idp admin-add-user-to-group --user-pool-id <UserPoolId> --username juf.an --group-name admin
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
