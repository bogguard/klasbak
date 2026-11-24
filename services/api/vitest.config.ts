import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api',
    env: {
      TABLE_NAME: 'test-table',
      WEB_BUCKET: 'test-bucket',
      PHOTOS_BUCKET: 'test-photos',
      // Signed links are made locally (no request), but need credentials to sign with.
      AWS_ACCESS_KEY_ID: 'test',
      AWS_SECRET_ACCESS_KEY: 'test',
      POWERTOOLS_METRICS_NAMESPACE: 'KlasbakTest',
      INSTITUTION_NUMBER: '012345',
      POWERTOOLS_DEV: 'true',
      POWERTOOLS_LOG_LEVEL: 'SILENT',
      AWS_REGION: 'eu-west-1',
    },
  },
});
