import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    passWithNoTests: true,
    env: {
      GCP_PROJECT_ID: 'test-project',
      GCP_REGION: 'us-central1',
      UPLOADS_BUCKET: 'test-uploads',
      ASSETS_BUCKET: 'test-assets',
      TEMP_BUCKET: 'test-temp',
      PUBSUB_SUBSCRIPTION: 'test-sub',
      FIRESTORE_DATABASE: '(default)',
    },
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
