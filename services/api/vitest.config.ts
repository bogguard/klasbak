import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api',
    env: {
      TABLE_NAME: 'test-table',
      WEB_BUCKET: 'test-bucket',
      POWERTOOLS_METRICS_NAMESPACE: 'KlasbakTest',
      INSTITUTION_NUMBER: '012345',
      POWERTOOLS_DEV: 'true',
      POWERTOOLS_LOG_LEVEL: 'SILENT',
      AWS_REGION: 'eu-west-1',
    },
  },
});
