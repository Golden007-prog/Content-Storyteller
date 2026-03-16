/**
 * Property-based tests for model router.
 *
 * Feature: vertex-ai-model-router
 *
 * Property 2: Fallback chain selects the first available model
 * Property 3: All-unavailable fallback chain marks slot as degraded
 * Property 7: Environment override skips availability check for that slot
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  type CapabilitySlot,
  SLOT_ENV_VARS,
  _resetConfigForTesting,
} from '../ai/model-config';
import {
  FALLBACK_CHAINS,
  initModelRouter,
  _resetRouterForTesting,
} from '../ai/model-router';

// Slots that have fallback chains defined
const SLOTS_WITH_CHAINS = Object.keys(FALLBACK_CHAINS) as CapabilitySlot[];

// All capability slots
const ALL_SLOTS: CapabilitySlot[] = Object.keys(SLOT_ENV_VARS) as CapabilitySlot[];

// Track env vars for cleanup
let envVarsToClean: string[] = [];

describe('Property 2: Fallback chain selects the first available model', () => {
  beforeEach(() => {
    _resetRouterForTesting();
    _resetConfigForTesting();
    envVarsToClean = [];
  });

  afterEach(() => {
    for (const v of envVarsToClean) delete process.env[v];
    _resetConfigForTesting();
    _resetRouterForTesting();
  });

  /**
   * **Validates: Requirements 2.3, 3.2, 3.3, 3.4**
   *
   * For any capability slot with a fallback chain and any boolean availability
   * pattern (with at least one true), the router resolves to the first model
   * whose availability check returns true.
   */
  it('should resolve to the first available model in the fallback chain', async () => {
    // Arbitrary: pick a slot with a chain, then generate a boolean array of matching length
    // with at least one true value
    const slotWithPatternArb = fc.constantFrom(...SLOTS_WITH_CHAINS).chain((slot) => {
      const chain = FALLBACK_CHAINS[slot]!;
      return fc
        .array(fc.boolean(), { minLength: chain.length, maxLength: chain.length })
        .filter((bools) => bools.some(Boolean))
        .map((pattern) => ({ slot, chain, pattern }));
    });

    await fc.assert(
      fc.asyncProperty(slotWithPatternArb, async ({ slot, chain, pattern }) => {
        _resetRouterForTesting();
        _resetConfigForTesting();

        // Build a mock that returns the boolean at the corresponding chain index
        const checkAvailability = vi.fn(async (model: string) => {
          const idx = chain.indexOf(model);
          if (idx === -1) return true; // non-chain models are available
          return pattern[idx];
        });

        const result = await initModelRouter({ checkAvailability });
        const resolved = result[slot];

        // Expected: first model in chain where pattern is true
        const expectedIdx = pattern.indexOf(true);
        const expectedModel = chain[expectedIdx];

        expect(resolved.model).toBe(expectedModel);
        expect(resolved.status).toBe('available');

        // If the first in chain is available, no fallback should be used
        if (expectedIdx === 0) {
          expect(resolved.fallbackUsed).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 3: All-unavailable fallback chain marks slot as degraded', () => {
  beforeEach(() => {
    _resetRouterForTesting();
    _resetConfigForTesting();
    envVarsToClean = [];
  });

  afterEach(() => {
    for (const v of envVarsToClean) delete process.env[v];
    _resetConfigForTesting();
    _resetRouterForTesting();
  });

  /**
   * **Validates: Requirements 3.8**
   *
   * For any capability slot with a fallback chain, if every model in the chain
   * is unavailable, the slot is marked 'degraded' and no error is thrown.
   */
  it('should mark slot as degraded when all models in chain are unavailable', async () => {
    const slotArb = fc.constantFrom(...SLOTS_WITH_CHAINS);

    await fc.assert(
      fc.asyncProperty(slotArb, async (slot) => {
        _resetRouterForTesting();
        _resetConfigForTesting();

        const chain = FALLBACK_CHAINS[slot]!;

        // All chain models unavailable; non-chain models available
        const checkAvailability = vi.fn(async (model: string) => {
          return !chain.includes(model);
        });

        // Should NOT throw
        const result = await initModelRouter({ checkAvailability });
        const resolved = result[slot];

        expect(resolved.status).toBe('degraded');
        // The model should be the last in the chain (implementation detail from source)
        expect(resolved.model).toBe(chain[chain.length - 1]);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 7: Environment override skips availability check for that slot', () => {
  beforeEach(() => {
    _resetRouterForTesting();
    _resetConfigForTesting();
    envVarsToClean = [];
  });

  afterEach(() => {
    for (const v of envVarsToClean) delete process.env[v];
    // Clean all VERTEX_* env vars to prevent cross-test contamination
    for (const envVar of Object.values(SLOT_ENV_VARS)) {
      delete process.env[envVar];
    }
    _resetConfigForTesting();
    _resetRouterForTesting();
  });

  /**
   * **Validates: Requirements 10.3**
   *
   * For any capability slot where the VERTEX_* env var is set, the router uses
   * the override value directly and does NOT call checkAvailability for that
   * slot's model.
   */
  it('should use override value and skip availability check for overridden slot', async () => {
    const slotArb = fc.constantFrom(...ALL_SLOTS);
    const overrideArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9._-]{0,31}$/).filter((s) => s.length > 0);

    await fc.assert(
      fc.asyncProperty(slotArb, overrideArb, async (slot, overrideValue) => {
        _resetRouterForTesting();
        _resetConfigForTesting();

        // Set the env var for this slot
        const envVar = SLOT_ENV_VARS[slot];
        process.env[envVar] = overrideValue;
        envVarsToClean.push(envVar);

        const checkedModels: string[] = [];
        const checkAvailability = vi.fn(async (model: string) => {
          checkedModels.push(model);
          return true;
        });

        const result = await initModelRouter({ checkAvailability });
        const resolved = result[slot];

        // The resolved model should be the override value
        expect(resolved.model).toBe(overrideValue);
        expect(resolved.isOverride).toBe(true);

        // checkAvailability should NOT have been called with the override value
        expect(checkedModels).not.toContain(overrideValue);

        // Cleanup for next iteration
        delete process.env[envVar];
        _resetConfigForTesting();
        _resetRouterForTesting();
      }),
      { numRuns: 100 },
    );
  });
});
