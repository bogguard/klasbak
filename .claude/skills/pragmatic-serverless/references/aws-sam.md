# AWS SAM & serverless conventions

## Template layout

```
infra/
  template.yaml        # root SAM template (or nested stacks only when it gets large)
  samconfig.toml       # [dev] and [prod] config environments
```

## Baseline template snippet

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Library app – API and data

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, prod]
  AlarmEmail:
    Type: String

Conditions:
  IsProd: !Equals [!Ref Environment, prod]

Globals:
  Function:
    Runtime: nodejs24.x          # newest Node LTS that Lambda supports; check before upgrading
    Architectures: [arm64]
    MemorySize: 512
    Timeout: 10
    Tracing: Active
    LoggingConfig:
      LogFormat: JSON
      ApplicationLogLevel: !If [IsProd, INFO, DEBUG]
    Environment:
      Variables:
        POWERTOOLS_SERVICE_NAME: library
        POWERTOOLS_METRICS_NAMESPACE: Library
        TABLE_NAME: !Ref Table
        NODE_OPTIONS: --enable-source-maps
    Tags:
      project: library
      environment: !Ref Environment

Resources:
  Table:
    Type: AWS::DynamoDB::Table
    DeletionPolicy: Retain
    UpdateReplacePolicy: Retain
    Properties:
      BillingMode: PAY_PER_REQUEST
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true }
      SSESpecification: { SSEEnabled: true }
      TimeToLiveSpecification: { AttributeName: expiresAt, Enabled: true }
      AttributeDefinitions:
        - { AttributeName: pk, AttributeType: S }
        - { AttributeName: sk, AttributeType: S }
      KeySchema:
        - { AttributeName: pk, KeyType: HASH }
        - { AttributeName: sk, KeyType: RANGE }

  CatalogFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: index.handler
      CodeUri: ../services/api/src/catalog
      Policies:
        - DynamoDBCrudPolicy: { TableName: !Ref Table }
      Events:
        Api:
          Type: HttpApi
          Properties: { ApiId: !Ref HttpApi, Path: /api/catalog/{proxy+}, Method: ANY }
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Format: esm
        Target: es2023
        Minify: true
        Sourcemap: true
        OutExtension: [.js=.mjs]
        EntryPoints: [handler.ts]

  CatalogLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub /aws/lambda/${CatalogFunction}
      RetentionInDays: !If [IsProd, 30, 7]
```

## Conventions

- **One Lambda per domain** (catalog, circulation, readers, admin, jobs) with a small router inside (e.g. Hono). Fewer cold starts and less YAML than one function per route, still clear blast-radius boundaries.
- **Single CloudFront distribution**: default behaviour → S3 (SPA), `/api/*` → HTTP API. Same origin = no CORS, one place for security headers and (optional) WAF.
- **Stateful resources** (tables, buckets, user pool) get `Retain` policies. Consider a separate stateful stack if you often tear down/recreate the app stack.
- **No hardcoded names** for resources unless needed; let CloudFormation generate them and pass via env vars/outputs.
- **Environments**: separate AWS accounts for dev and prod is ideal (AWS Organizations); at minimum separate stacks with an `Environment` parameter.
- **Deploy**: `sam build && sam deploy --config-env <env>`; CI deploys `dev` on merge to `main`, `prod` on tag/manual approval.

## DynamoDB modelling

1. Write down the **access patterns** first (in `docs/decisions.md`).
2. Single table with generic `pk`/`sk` and a few overloaded GSIs (`gsi1pk`/`gsi1sk`) — only as many as access patterns require.
3. Use **sparse GSIs** for "work lists" (e.g. only active loans carry `gsi1pk = LOAN#ACTIVE`, `gsi1sk = <dueDate>` → overdue query is cheap).
4. Use `ConditionExpression` / transactions to enforce invariants.
5. Use `lib-dynamodb` `DynamoDBDocumentClient` with `removeUndefinedValues: true`.
6. Store a `version` attribute for optimistic locking on records edited by humans.

## Lambda handler skeleton

```ts
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';

export const logger = new Logger();
export const metrics = new Metrics();
export const tracer = new Tracer();

// Clients are created once per container, outside the handler.
const ddb = tracer.captureAWSv3Client(new DynamoDBClient({}));
```

Keep handlers thin: validate (Zod) → call service → map to response. Map domain errors to HTTP codes in one shared error handler.

## Things that cost money quietly

NAT gateways, VPC endpoints (interface), CloudWatch Logs without retention, X-Ray at 100% sampling on high traffic, OpenSearch, RDS/Aurora minimum capacity, WAF (per ACL + per rule), Secrets Manager (per secret – SSM SecureString is free for standard params), KMS customer-managed keys (per key per month). Use them when justified — state the estimate.
