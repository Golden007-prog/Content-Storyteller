import { beforeEach } from 'vitest';
import { _resetConfigForTesting } from '../config/gcp';

// Reset the GCP config singleton before each test to avoid stale state
beforeEach(() => {
  _resetConfigForTesting();
});
