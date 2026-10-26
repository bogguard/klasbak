# AWS SAM, Lambda & serverless conventions

## Template layout

```
infra/
  template.yaml        # root SAM template (nested stacks only when it gets large)
  samconfig.toml       # one config environment per stage, e.g. [dev] and [prod]
```

## Baseline template snippet

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: My app – API and data

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, prod]
  AlarmEmail:
    Type: AWS::SSM::Parameter::Value<String> # kept out of git
    Default: /my-app/alarm-email

Conditions:
  IsProd: !Equals [!Ref Environment, prod]

Globals:
  Function:
    Runtime: nodejs24.x # newest Node LTS that Lambda supports; check before upgrading
    Architectures: [arm64]
    MemorySize: 512
    Timeout: 10
    Tracing: Active
    LoggingConfig:
      LogFormat: JSON
      ApplicationLogLevel: !If [IsProd, INFO, DEBUG]
    Environment:
      Variables:
        POWERTOOLS_SERVICE_NAME: my-app
        POWERTOOLS_METRICS_NAMESPACE: MyApp
        TABLE_NAME: !Ref Table
        NODE_OPTIONS: --enable-source-maps
    Tags:
      project: my-app
      environment: !Ref Environment

Resources:
  Table:
    Type: AWS::DynamoDB::Table
    DeletionPolicy: Retain
    UpdateReplacePolicy: Retain
    Properties:
      BillingMode: PAY_PER_REQUEST
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true }
      DeletionProtectionEnabled: !If [IsProd, true, false]
      SSESpecification: { SSEEnabled: true }
      TimeToLiveSpecification: { AttributeName: expiresAt, Enabled: true }
      AttributeDefinitions:
        - { AttributeName: pk, AttributeType: S }
        - { AttributeName: sk, AttributeType: S }
      KeySchema:
        - { AttributeName: pk, KeyType: HASH }
        - { AttributeName: sk, KeyType: RANGE }

  OrdersFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: index.handler
      CodeUri: ../services/api/dist/orders # one small bundle per function
      Policies:
        - DynamoDBCrudPolicy: { TableName: !Ref Table }
      Events:
        Api:
          Type: HttpApi
          Properties: { ApiId: !Ref HttpApi, Path: /api/orders/{proxy+}, Method: ANY }

  OrdersLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub /aws/lambda/${OrdersFunction}
      RetentionInDays: !If [IsProd, 30, 7]
```

## Lambda best practices

**Shape**

- **One function per domain area** (e.g. `orders`, `billing`, plus one per background job) with a small router inside (e.g. Hono). Fewer cold starts and less YAML than one function per route, still clear permission and blast-radius boundaries.
- **Thin handler**: validate (Zod) → call the service → map to a response. Domain errors map to HTTP codes in one shared error handler.
- **Keep handlers runnable outside Lambda** (a local server or tests call the same app); no AWS-only assumptions in business code.

**Performance and cold starts**

- **Initialise outside the handler**: SDK clients, configuration and anything reusable are created once per container and reused across invocations.
- **Small deployment packages**: one tree-shaken ESM bundle per function, only the modular SDK v3 clients you use, source maps for readable stack traces, nothing from dev dependencies.
- **Load heavy or rarely used code lazily** (dynamic `import()` inside the code path that needs it).
- **Right-size memory** (CPU scales with it): start at 512 MB, measure (e.g. AWS Lambda Power Tuning), and lower or raise based on cost and latency. `arm64` by default.
- **No VPC** unless the function must reach private resources; then mind the cost of NAT and endpoints.

**Reliability**

- **Timeouts**: function timeout below the API Gateway limit (HTTP API: 30 s); explicit timeouts on every outbound call with a graceful fallback.
- **Idempotency** for anything that can be retried (API retries, async invocations, SQS redelivery): conditional writes or Powertools Idempotency.
- **Async and batch**: SQS with a DLQ, `ReportBatchItemFailures` so one bad message doesn't retry the whole batch, alarms on DLQ depth; DLQ or on-failure destination for async invocations.
- **No recursion**: a function must not trigger itself (e.g. writing to the bucket that invokes it) without a guard.
- **Reserved concurrency** only to protect a downstream system or cap cost, with a reason.
- **Gradual deployments in prod**: `AutoPublishAlias: live` with `DeploymentPreference` (`Linear10PercentEvery1Minute` in prod, `AllAtOnce` in dev) and the function's error alarm under `Alarms`, so a bad release rolls back by itself.

**Configuration and security**

- **One execution role per function**, least privilege, scoped to specific resources (SAM policy templates).
- **Configuration from environment variables**, validated at startup; **secrets from SSM Parameter Store / Secrets Manager** with caching (Powertools Parameters), never in environment variables in plain text or in git.
- **Structured logs, metrics and traces** via Powertools; log level from an environment variable; explicit log retention.
- **Runtime upgrades are planned**: track Lambda's Node.js deprecation dates and upgrade to the next LTS deliberately.

## Conventions

- **Single CloudFront distribution**: default behaviour → S3 (SPA), `/api/*` → HTTP API. Same origin = no CORS, one place for security headers and (optional) WAF.
- **Stateful resources** (tables, buckets, user pool) get `Retain` policies. Consider a separate stateful stack if you often tear down/recreate the app stack.
- **No hardcoded names** for resources unless needed; let CloudFormation generate them and pass via env vars/outputs.
- **Environments**: a separate AWS account per environment (and per customer when installations are separate) is ideal; at minimum separate stacks with an `Environment` parameter. Profiles pick the account; the `Environment` parameter picks how strict the stack is (deletion protection, log retention, budget).
- **Installation settings** that must stay out of git (alarm address, API keys, domain name) live in SSM Parameter Store and are read by the template (`AWS::SSM::Parameter::Value<String>`) or at runtime.
- **Deploy**: `sam deploy --config-env <env>` after building the functions; CI deploys `dev` on merge to `main`, `prod` on tag/manual approval.

## DynamoDB modelling

1. Write down the **access patterns** first (in `docs/decisions.md`), and keep the item keys documented in one file in the code.
2. Single table with generic `pk`/`sk` and a few overloaded GSIs (`gsi1pk`/`gsi1sk`) — only as many as access patterns require.
3. Use **sparse GSIs** for "work lists" (e.g. only active loans carry `gsi1pk = LOANS#ACTIVE`, `gsi1sk = <dueDate>` → the overdue query is cheap).
4. Use `ConditionExpression` / transactions to enforce invariants; keep derived data (counters, statistics) in the same transaction so it never drifts.
5. Use `lib-dynamodb` `DynamoDBDocumentClient` with `removeUndefinedValues: true`.
6. Store a `version` attribute for optimistic locking on records edited by humans.

## Lambda handler skeleton

```ts
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export const logger = new Logger();
export const metrics = new Metrics();
export const tracer = new Tracer();

// Clients are created once per container, outside the handler.
export const db = DynamoDBDocumentClient.from(tracer.captureAWSv3Client(new DynamoDBClient({})), {
  marshallOptions: { removeUndefinedValues: true },
});
```

## Things that cost money quietly

NAT gateways, VPC endpoints (interface), CloudWatch Logs without retention, X-Ray at 100% sampling on high traffic, OpenSearch, RDS/Aurora minimum capacity, WAF (per ACL + per rule), Secrets Manager (per secret – SSM SecureString is free for standard params), KMS customer-managed keys (per key per month). Use them when justified — state the estimate.
