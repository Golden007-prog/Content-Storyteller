/**
 * Property-based tests for model configuration.
 *
 * Feature: vertex-ai-model-router, Property 1: Environment variable override applies to any capability slot
 *
 * Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  type CapabilitySlot,
  SLOT_ENV_VARS,
  MODEL_DEFAULTS,
  getModelConfig,
  _resetConfigForTesting,
} from '../ai/model-config';

// All capability slot names for use in arbitraries
const ALL_SLOTS: CapabilitySlot[] = Object.keys(SLOT_ENV_VARS) as CapabilitySlot[];

// Arbitrary that picks a random capability slot
const slotArb = fc.constantFrom(...ALL_SLOTS);

// Arbitrary that generates a non-empty alphanumeric model name string
const modelNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/).filter((s) => s.length > 0);

// Track env vars set during a test run for cleanup
let envVarsToClean: string[] = [];

describe('Property 1: Environment variable override applies to any capability slot', () => {
  beforeEach(() => {
    _resetConfigForTesting();
    envVarsToClean = [];
  });

  afterEach(() => {
    for (const envVar of envVarsToClean) {
      delete process.env[envVar];
    }
    _resetConfigForTesting();
  });

  // Feature: vertex-ai-model-router, Property 1: Environment variable override applies to any capability slot
  it('should return the env var value for any slot when the corresponding VERTEX_* env var is set', () => {
    fc.assert(
      fc.property(slotArb, modelNameArb, (slot, modelName) => {
        // Arrange: reset config and set the env var for this slot
        _resetConfigForTesting();
        const envVar = SLOT_ENV_VARS[slot];
        process.env[envVar] = modelName;
        envVarsToClean.push(envVar);

        // Act
        const config = getModelConfig();

        // Assert: the slot should have the overridden value
        expect(config.slots[slot]).toBe(modelName);

        // Cleanup for next iteration
        delete process.env[envVar];
        _resetConfigForTesting();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10**
   *
   * Complementary check: other slots remain at their defaults when only one slot is overridden.
   */
  it('should not affect other slots when only one slot is overridden', () => {
    fc.assert(
      fc.property(slotArb, modelNameArb, (slot, modelName) => {
        _resetConfigForTesting();
        const envVar = SLOT_ENV_VARS[slot];
        process.env[envVar] = modelName;
        envVarsToClean.push(envVar);

        const config = getModelConfig();

        // All other slots should still have their defaults
        for (const otherSlot of ALL_SLOTS) {
          if (otherSlot !== slot) {
            expect(config.slots[otherSlot]).toBe(MODEL_DEFAULTS[otherSlot]);
          }
        }

        delete process.env[envVar];
        _resetConfigForTesting();
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property-based tests for no hardcoded model strings.
 *
 * Feature: vertex-ai-model-router, Property 5: No hardcoded model name strings in source files
 *
 * Validates: Requirements 7.8
 */
import * as fs from 'fs';
import * as path from 'path';

/** Recursively collect .ts source files, excluding test files, __tests__ dirs, and model-config.ts */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules' || entry.name === 'dist') continue;
      results.push(...collectSourceFiles(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      entry.name !== 'model-config.ts' &&
      entry.name !== 'model-router.ts'
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

// Resolve source directories relative to the workspace root
const workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..');
const SOURCE_DIRS = [
  path.join(workspaceRoot, 'apps', 'api', 'src'),
  path.join(workspaceRoot, 'apps', 'worker', 'src'),
  path.join(workspaceRoot, 'packages', 'shared', 'src', 'ai'),
];

// Collect all source files once
const allSourceFiles = SOURCE_DIRS.flatMap(collectSourceFiles);

// All model names from MODEL_DEFAULTS plus the old hardcoded model
const FORBIDDEN_MODEL_STRINGS = [
  ...Object.values(MODEL_DEFAULTS),
  'gemini-2.0-flash', // old hardcoded model name
];

describe('Property 5: No hardcoded model name strings in source files', () => {
  // Feature: vertex-ai-model-router, Property 5: No hardcoded model name strings in source files

  /**
   * **Validates: Requirements 7.8**
   *
   * For any model name from MODEL_DEFAULTS (plus the old hardcoded model),
   * no source file (outside of model-config.ts and test files) contains
   * that model name as a string literal.
   */
  it('should not find any MODEL_DEFAULTS model name as a hardcoded string in source files', () => {
    // Ensure we actually have source files to scan
    expect(allSourceFiles.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.constantFrom(...FORBIDDEN_MODEL_STRINGS), (modelName) => {
        for (const filePath of allSourceFiles) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const relativePath = path.relative(workspaceRoot, filePath);

          // Check for the model name as a string literal (quoted)
          const singleQuotePattern = `'${modelName}'`;
          const doubleQuotePattern = `"${modelName}"`;
          const backtickPattern = `\`${modelName}\``;

          const hasSingleQuote = content.includes(singleQuotePattern);
          const hasDoubleQuote = content.includes(doubleQuotePattern);
          const hasBacktick = content.includes(backtickPattern);

          if (hasSingleQuote || hasDoubleQuote || hasBacktick) {
            return false; // Property violation: hardcoded model string found
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});
