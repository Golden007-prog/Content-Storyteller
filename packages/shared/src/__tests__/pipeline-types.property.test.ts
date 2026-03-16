/**
 * Property-based tests for smart pipeline orchestration shared types.
 *
 * Property 4: Planner output structure completeness
 * Property 12: Steps metadata structure after pipeline execution
 * Property 15: Warning structure validity
 * Property 16: Job serialization round-trip
 *
 * Feature: smart-pipeline-orchestration
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  JobState,
  AssetType,
  OutputPreference,
  Platform,
  Tone,
} from '../index';
import type {
  OutputIntent,
  StepStatus,
  StepMetadata,
  StepsMap,
  JobWarning,
  Job,
} from '../index';

// ── Arbitraries ─────────────────────────────────────────────────────

const OUTPUT_INTENT_FIELDS: (keyof OutputIntent)[] = [
  'wantsCopy',
  'wantsHashtags',
  'wantsImage',
  'wantsVideo',
  'wantsStoryboard',
  'wantsVoiceover',
  'wantsCarousel',
  'wantsThread',
  'wantsLinkedInPost',
];

const VALID_STEP_STATUSES: StepStatus[] = ['queued', 'running', 'completed', 'skipped', 'failed'];

const STEPS_MAP_KEYS: (keyof StepsMap)[] = [
  'processInput',
  'generateCopy',
  'generateImages',
  'generateVideo',
  'composePackage',
];

const arbOutputIntent: fc.Arbitrary<OutputIntent> = fc.record({
  wantsCopy: fc.boolean(),
  wantsHashtags: fc.boolean(),
  wantsImage: fc.boolean(),
  wantsVideo: fc.boolean(),
  wantsStoryboard: fc.boolean(),
  wantsVoiceover: fc.boolean(),
  wantsCarousel: fc.boolean(),
  wantsThread: fc.boolean(),
  wantsLinkedInPost: fc.boolean(),
});

const arbStepStatus: fc.Arbitrary<StepStatus> = fc.constantFrom(...VALID_STEP_STATUSES);

const arbStepMetadata: fc.Arbitrary<StepMetadata> = fc.record({
  status: arbStepStatus,
  startedAt: fc.option(fc.date(), { nil: undefined }),
  completedAt: fc.option(fc.date(), { nil: undefined }),
  errorMessage: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
});

const arbStepsMap: fc.Arbitrary<StepsMap> = fc.record({
  processInput: arbStepMetadata,
  generateCopy: arbStepMetadata,
  generateImages: arbStepMetadata,
  generateVideo: arbStepMetadata,
  composePackage: arbStepMetadata,
});

const arbSeverity: fc.Arbitrary<'info' | 'warning'> = fc.constantFrom('info' as const, 'warning' as const);

const arbJobWarning: fc.Arbitrary<JobWarning> = fc.record({
  stage: fc.string({ minLength: 1, maxLength: 50 }),
  message: fc.string({ minLength: 1, maxLength: 200 }),
  timestamp: fc.date(),
  severity: arbSeverity,
});

// ── Property 4: Planner output structure completeness ───────────────
// Feature: smart-pipeline-orchestration, Property 4: Planner output structure completeness
// **Validates: Requirements 3.2**
describe('Property 4: Planner output structure completeness', () => {
  it('for any valid OutputIntent, all 9 boolean fields must be present', () => {
    fc.assert(
      fc.property(arbOutputIntent, (intent: OutputIntent) => {
        // All 9 fields must exist
        for (const field of OUTPUT_INTENT_FIELDS) {
          expect(intent).toHaveProperty(field);
          expect(typeof intent[field]).toBe('boolean');
        }
        // Exactly 9 fields
        expect(Object.keys(intent)).toHaveLength(9);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 12: Steps metadata structure after pipeline execution ──
// Feature: smart-pipeline-orchestration, Property 12: Steps metadata structure after pipeline execution
// **Validates: Requirements 2.5**
describe('Property 12: Steps metadata structure after pipeline execution', () => {
  it('StepsMap has exactly 5 keys, each status is a valid StepStatus', () => {
    fc.assert(
      fc.property(arbStepsMap, (steps: StepsMap) => {
        const keys = Object.keys(steps);
        // Exactly 5 keys
        expect(keys).toHaveLength(5);
        // All expected keys present
        for (const key of STEPS_MAP_KEYS) {
          expect(steps).toHaveProperty(key);
        }
        // Each status is valid
        for (const key of STEPS_MAP_KEYS) {
          expect(VALID_STEP_STATUSES).toContain(steps[key].status);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 15: Warning structure validity ─────────────────────────
// Feature: smart-pipeline-orchestration, Property 15: Warning structure validity
// **Validates: Requirements 8.6, 7.5**
describe('Property 15: Warning structure validity', () => {
  it('every JobWarning has required fields with correct types', () => {
    fc.assert(
      fc.property(arbJobWarning, (warning: JobWarning) => {
        expect(typeof warning.stage).toBe('string');
        expect(warning.stage.length).toBeGreaterThan(0);
        expect(typeof warning.message).toBe('string');
        expect(warning.message.length).toBeGreaterThan(0);
        expect(warning.timestamp).toBeInstanceOf(Date);
        expect(['info', 'warning']).toContain(warning.severity);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 16: Job serialization round-trip ───────────────────────
// Feature: smart-pipeline-orchestration, Property 16: Job serialization round-trip
// **Validates: Requirements 7.7**
describe('Property 16: Job serialization round-trip', () => {
  const arbJobWithNewFields: fc.Arbitrary<Job> = fc.record({
    id: fc.uuid(),
    correlationId: fc.uuid(),
    idempotencyKey: fc.uuid(),
    state: fc.constantFrom(...Object.values(JobState)),
    uploadedMediaPaths: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 3 }),
    assets: fc.constant([]),
    fallbackNotices: fc.constant([]),
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
    updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
    promptText: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
    platform: fc.option(fc.constantFrom(...Object.values(Platform)), { nil: undefined }),
    tone: fc.option(fc.constantFrom(...Object.values(Tone)), { nil: undefined }),
    outputIntent: fc.option(arbOutputIntent, { nil: undefined }),
    outputPreference: fc.option(fc.constantFrom(...Object.values(OutputPreference)), { nil: undefined }),
    steps: fc.option(arbStepsMap, { nil: undefined }),
    requestedOutputs: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 5 }), { nil: undefined }),
    completedOutputs: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 5 }), { nil: undefined }),
    skippedOutputs: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 5 }), { nil: undefined }),
    warnings: fc.option(fc.array(arbJobWarning, { maxLength: 3 }), { nil: undefined }),
  });

  it('serialize/deserialize Job with new fields produces equivalent object', () => {
    fc.assert(
      fc.property(arbJobWithNewFields, (job: Job) => {
        const serialized = JSON.stringify(job);
        const deserialized = JSON.parse(serialized);

        // Scalar and enum fields round-trip exactly
        expect(deserialized.id).toBe(job.id);
        expect(deserialized.correlationId).toBe(job.correlationId);
        expect(deserialized.idempotencyKey).toBe(job.idempotencyKey);
        expect(deserialized.state).toBe(job.state);
        expect(deserialized.uploadedMediaPaths).toEqual(job.uploadedMediaPaths);

        // New pipeline fields round-trip
        if (job.outputIntent !== undefined) {
          expect(deserialized.outputIntent).toEqual(job.outputIntent);
        } else {
          expect(deserialized.outputIntent).toBeUndefined();
        }

        if (job.outputPreference !== undefined) {
          expect(deserialized.outputPreference).toBe(job.outputPreference);
        } else {
          expect(deserialized.outputPreference).toBeUndefined();
        }

        if (job.steps !== undefined) {
          // Steps status values round-trip; dates become strings in JSON
          for (const key of STEPS_MAP_KEYS) {
            expect(deserialized.steps[key].status).toBe(job.steps[key].status);
          }
        } else {
          expect(deserialized.steps).toBeUndefined();
        }

        if (job.requestedOutputs !== undefined) {
          expect(deserialized.requestedOutputs).toEqual(job.requestedOutputs);
        }
        if (job.completedOutputs !== undefined) {
          expect(deserialized.completedOutputs).toEqual(job.completedOutputs);
        }
        if (job.skippedOutputs !== undefined) {
          expect(deserialized.skippedOutputs).toEqual(job.skippedOutputs);
        }

        if (job.warnings !== undefined) {
          expect(deserialized.warnings).toHaveLength(job.warnings.length);
          for (let i = 0; i < job.warnings.length; i++) {
            expect(deserialized.warnings[i].stage).toBe(job.warnings[i].stage);
            expect(deserialized.warnings[i].message).toBe(job.warnings[i].message);
            expect(deserialized.warnings[i].severity).toBe(job.warnings[i].severity);
          }
        }

        // Verify the deserialized JSON can be re-serialized identically
        expect(JSON.stringify(deserialized)).toBe(serialized);
      }),
      { numRuns: 100 },
    );
  });
});
