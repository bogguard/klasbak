/*
 * Environment for local development. Imported first by the local server and seed script,
 * before any module that creates AWS clients. Real environment variables win.
 */
const defaults: Record<string, string> = {
  TABLE_NAME: 'library-local',
  DYNAMODB_ENDPOINT: 'http://localhost:8000',
  LOCAL_PUBLIC_DIR: '.local/public',
  WEB_BUCKET: 'unused-locally',
  AWS_REGION: 'eu-west-1',
  // DynamoDB Local accepts any credentials; these keep your real AWS profile out of it.
  AWS_ACCESS_KEY_ID: 'local',
  AWS_SECRET_ACCESS_KEY: 'local',
  POWERTOOLS_SERVICE_NAME: 'library-local',
  POWERTOOLS_METRICS_NAMESPACE: 'LibraryLocal',
  POWERTOOLS_METRICS_DISABLED: 'true',
  POWERTOOLS_DEV: 'true',
  POWERTOOLS_LOG_LEVEL: 'INFO',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
