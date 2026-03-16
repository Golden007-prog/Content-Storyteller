/**
 * Unit tests for smart pipeline orchestration shared types.
 *
 * - Backward compatibility: Job objects without new fields are still valid
 * - OutputPreference enum values match expected strings
 * - StepStatus type covers all valid values
 *
 * Feature: smart-pipeline-orchestration
 * Validates: Requirements 2.1, 7.6
 */
import { describe, it, expect } from 'vitest';
import {
  JobState,
  AssetType,
  OutputPreference,
} from '../index';
import type {
  Job,
  OutputIntent,
  StepStatus,
  StepMetadata,
  StepsMap,
  JobWarning,
} from '../index';

describe('OutputPreference enum values', () => {
  it('has Auto mapped to "auto"', () => {
    expect(OutputPreference.Auto).toBe('auto');
  });

  it('has CopyOnly mapped to "copy_only"', () => {
    expect(OutputPreference.CopyOnly).toBe('copy_only');
  });

  it('has CopyImage mapped to "copy_image"', () => {
    expect(OutputPreference.CopyImage).toBe('copy_image');
  });

  it('has CopyVideo mapped to "copy_video"', () => {
    expect(OutputPreference.CopyVideo).toBe('copy_video');
  });

  it('has FullPackage mapped to "full_package"', () => {
    expect(OutputPreference.FullPackage).toBe('full_package');
  });

  it('has exactly 6 values', () => {
    expect(Object.values(OutputPreference)).toHaveLength(6);
  });
});

describe('StepStatus type coverage', () => {
  const ALL_STEP_STATUSES: StepStatus[] = ['queued', 'running', 'completed', 'skipped', 'failed'];

  it('covers all 5 valid values', () => {
    expect(ALL_STEP_STATUSES).toHaveLength(5);
  });

  it('each status can be assigned to a StepMetadata', () => {
    for (const status of ALL_STEP_STATUSES) {
      const meta: StepMetadata = { status };
      expect(meta.status).toBe(status);
    }
  });
});

describe('Backward compatibility — Job without new fields', () => {
  const legacyJob: Job = {
    id: 'job-legacy-001',
    correlationId: 'corr-001',
    idempotencyKey: 'idem-001',
    state: JobState.Completed,
    uploadedMediaPaths: ['path/to/file.jpg'],
    assets: [],
    fallbackNotices: [],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  it('Job without outputIntent is valid', () => {
    expect(legacyJob.outputIntent).toBeUndefined();
  });

  it('Job without outputPreference is valid', () => {
    expect(legacyJob.outputPreference).toBeUndefined();
  });

  it('Job without steps is valid', () => {
    expect(legacyJob.steps).toBeUndefined();
  });

  it('Job without requestedOutputs is valid', () => {
    expect(legacyJob.requestedOutputs).toBeUndefined();
  });

  it('Job without completedOutputs is valid', () => {
    expect(legacyJob.completedOutputs).toBeUndefined();
  });

  it('Job without skippedOutputs is valid', () => {
    expect(legacyJob.skippedOutputs).toBeUndefined();
  });

  it('Job without warnings is valid', () => {
    expect(legacyJob.warnings).toBeUndefined();
  });

  it('legacy Job retains all original required fields', () => {
    expect(legacyJob.id).toBe('job-legacy-001');
    expect(legacyJob.state).toBe(JobState.Completed);
    expect(legacyJob.uploadedMediaPaths).toEqual(['path/to/file.jpg']);
    expect(legacyJob.assets).toEqual([]);
    expect(legacyJob.fallbackNotices).toEqual([]);
  });
});

describe('Job with new pipeline fields', () => {
  const intent: OutputIntent = {
    wantsCopy: true,
    wantsHashtags: true,
    wantsImage: false,
    wantsVideo: false,
    wantsStoryboard: false,
    wantsVoiceover: false,
    wantsCarousel: false,
    wantsThread: false,
    wantsLinkedInPost: true,
  };

  const steps: StepsMap = {
    processInput: { status: 'completed' },
    generateCopy: { status: 'completed' },
    generateImages: { status: 'skipped' },
    generateVideo: { status: 'skipped' },
    composePackage: { status: 'completed' },
  };

  const fullJob: Job = {
    id: 'job-new-001',
    correlationId: 'corr-002',
    idempotencyKey: 'idem-002',
    state: JobState.Completed,
    uploadedMediaPaths: [],
    assets: [],
    fallbackNotices: [],
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-01-15'),
    outputIntent: intent,
    outputPreference: OutputPreference.CopyOnly,
    steps,
    requestedOutputs: ['copy', 'hashtags'],
    completedOutputs: ['copy', 'hashtags'],
    skippedOutputs: ['image', 'video'],
    warnings: [],
  };

  it('includes outputIntent with all 9 boolean fields', () => {
    expect(fullJob.outputIntent).toBeDefined();
    expect(Object.keys(fullJob.outputIntent!)).toHaveLength(9);
  });

  it('includes outputPreference', () => {
    expect(fullJob.outputPreference).toBe(OutputPreference.CopyOnly);
  });

  it('includes steps with all 5 pipeline stages', () => {
    expect(fullJob.steps).toBeDefined();
    expect(Object.keys(fullJob.steps!)).toHaveLength(5);
  });

  it('includes requestedOutputs, completedOutputs, skippedOutputs', () => {
    expect(fullJob.requestedOutputs).toEqual(['copy', 'hashtags']);
    expect(fullJob.completedOutputs).toEqual(['copy', 'hashtags']);
    expect(fullJob.skippedOutputs).toEqual(['image', 'video']);
  });
});

describe('Barrel exports include new pipeline types', () => {
  it('exports OutputPreference enum', () => {
    expect(OutputPreference).toBeDefined();
    expect(typeof OutputPreference).toBe('object');
  });
});
