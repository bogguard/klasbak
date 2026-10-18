# Runbook: following up an installation

What to watch, what each alarm means, and what to do. One installation is one AWS account and
stack (`library-prod` for a school, `library-dev` for testing); run commands with that account's
profile (`export AWS_PROFILE=...`).

## How you hear about problems

| Signal                                 | Comes from                                    | Sent to                                                      |
| -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| Alarm emails ("ALARM" and later "OK")  | CloudWatch alarms in the stack                | `/library/alarm-email` (confirm the subscription email once) |
| Budget emails at 80% and 100% (prod)   | AWS Budgets                                   | the same address                                             |
| A user mentions "referentie: abc12345" | The app, on unexpected errors                 | you (by phone or email)                                      |
| Security updates for dependencies      | Dependabot pull requests and alerts on GitHub | GitHub notifications                                         |
| Runtime end-of-life, AWS incidents     | AWS Health Dashboard                          | the account's email                                          |

Nothing is logged that identifies a pupil: no names, IP addresses or search terms. Logs are kept 30
days in prod, 7 in dev.

## Routine

- **Weekly, 5 minutes per school:** `scripts/status.sh prod` (or the dashboard, see the stack's
  `DashboardUrl` output). It shows the alarms, traffic, errors, the nightly job, costs and the latest
  warnings, and exits with an error when an alarm is on. Merge or close Dependabot pull requests.
- **Monthly:** costs (the budget emails warn, `status.sh` shows the month so far); the "ISBN sources
  failing" query (a book source that keeps failing makes adding books harder); AWS Health notices.
- **Once a year (summer):** check the Lambda runtime is still supported and plan the upgrade to the
  next Node.js LTS (`Runtime` in `infra/template.yaml`); try a backup restore in the test account
  (below); check with the school that the retention period (Instellingen) is still right.

## Alarms

Each alarm email has the alarm's description; the matching section is below.

### The API returned server errors

At least 5 requests ended in a server error (HTTP 5xx) within 5 minutes: users saw "Er ging iets mis
bij ons" with a reference.

1. Dashboard: is it one moment or ongoing, and which function has errors?
2. Logs Insights → saved query **"Errors and warnings"** (or `status.sh`): the error messages, with
   their reference (`function_request_id`).
3. If a user gave a reference: query **"Find an error by its reference"**, replace `REFERENCE`.
4. X-Ray (CloudWatch → X-Ray traces → traces with errors) shows which call failed, e.g. DynamoDB or
   Cognito.
5. After a deploy: roll back by deploying the previous version (`git checkout <previous tag>`, then
   `npm run deploy:prod && scripts/deploy-web.sh prod`).

The alarm sends "OK" once 5 minutes pass without server errors.

### Rebuilding the search index failed / search index updates gave up

The public catalogue (search, availability) may be out of date; lending itself works normally.

1. Query **"Errors and warnings"**, function `SearchIndexerFunction`.
2. Once fixed, any change to a title (or a loan) rebuilds the complete index.
3. The dead-letter queue keeps the failed events for 14 days. They are only triggers: after a
   successful rebuild, purge them (SQS console → the queue → Purge).

### Removing old reading history failed / did not run for two days

Returned loans older than the retention period are kept longer than promised to the school (privacy;
see the data processing agreement).

1. Query **"Errors and warnings"**, function `RetentionFunction`.
2. "Did not run": check the schedule in EventBridge Scheduler (it runs at 03:00 Brussels time).
3. After fixing, run it once by hand: Lambda console → `RetentionFunction` → Test, with `{}`.

Right after a new deployment this alarm can show "insufficient data" for a day; that's normal.

### Lambda functions were throttled

AWS refused to start more function instances (the account's concurrency limit, 1,000 by default; new
accounts sometimes start lower). Users may have seen errors.

1. Dashboard: which moment and how much traffic? A sudden peak can be misuse (the API also limits
   traffic to 50 requests/second).
2. Service Quotas → AWS Lambda → "Concurrent executions": ask for an increase if it's low.

### Budget at 80% or 100%

Usual costs are a few euros per month. Cost Explorer (Billing) shows which service grew. Look for log
volume, many requests (misuse), or resources created by hand outside the stack.

## Investigating

- **Dashboard** `library-<env>` (CloudWatch → Dashboards): alarms, requests and errors, response
  times, errors per function, library activity per day, latest errors and warnings.
- **Saved queries** (CloudWatch → Logs Insights → Saved queries, folder `library-<env>`):
  "Errors and warnings", "Find an error by its reference", "Slow requests", "Requests per route and
  status", "ISBN sources failing".
- **Traces** (X-Ray): every request with its calls to DynamoDB, S3 and Cognito, with timings.
- **Who changed what:** every change is written to the audit trail in the table (`AUDIT#…` items,
  kept two years), with the user's id.

## Restoring data

The table has point-in-time recovery: any moment of the last 35 days.

1. DynamoDB console → the table → Backups → Restore to point in time: restore into a new table.
2. Check the restored data, then copy back what's needed, or point the stack's `TABLE_NAME` to the
   new table. Practise this in the test account first.

Files (covers, logo, search index) are in the S3 bucket; the search index can always be rebuilt
from the table, covers can be uploaded again.
