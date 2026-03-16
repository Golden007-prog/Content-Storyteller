/**
 * Unit tests for model router.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 3.2, 3.3, 3.4, 3.5, 3.8
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _resetConfigForTesting, SLOT_ENV_VARS } from '../ai/model-config';
import {
  initModelRouter,
  getModel,
  FALLBACK_CHAINS,
  RouterNotInitializedError,
  ModelUnavailableError,
  _resetRouterForTesting,
} from '../ai/model-router';

// All VERTEX_* env var names for cleanup
const ALL_ENV_VARS = Object.values(SLOT_ENV_VARS);

describe('Model Router Unit Tests', () => {
  beforeEach(() => {
    _resetRouterForTesting();
    _resetConfigForTesting();
    for (const v of ALL_ENV_VARS) delete process.env[v];
  });

  afterEach(() => {
    for (const v of ALL_ENV_VARS) delete process.env[v];
    _resetConfigForTesting();
    _resetRouterForTesting();
  });

  // Requirement 2.1, 2.2: all slots resolve with primary when all available
  describe('initModelRouter with all models available', () => {
    it('should resolve all 8 slots with status available and no fallback', async () => {
      const checkAvailability = vi.fn(async () => true);
      const result = await initModelRouter({ checkAvailability });

      const slots = Object.keys(result);
      expect(slots).toHaveLength(8);

      for (const slot of slots) {
        const info = result[slot as keyof typeof result];
        expect(info.status).toBe('available');
        expect(info.fallbackUsed).toBeNull();
      }
    });
  });

  // Requirement 3.5: getModel before init throws RouterNotInitializedError
  describe('getModel before initModelRouter', () => {
    it('should throw RouterNotInitializedError when called before init', () => {
      expect(() => getModel('text')).toThrow(RouterNotInitializedError);
    });
  });

  // Requirement 3.5: live unavailable throws ModelUnavailableError
  describe('live model unavailable', () => {
    it('should throw ModelUnavailableError when live model is down', async () => {
      const checkAvailability = vi.fn(async (model: string) => {
        // live model default is gemini-live-2.5-flash-native-audio
        return model !== 'gemini-live-2.5-flash-native-audio';
      });

      await initModelRouter({ checkAvailability });
      expect(() => getModel('live')).toThrow(ModelUnavailableError);
    });
  });

  // Requirements 2.3, 3.2: text fallback chain
  describe('text fallback chain', () => {
    it('should use second model when primary text model is unavailable', async () => {
      const chain = FALLBACK_CHAINS.text!;
      const checkAvailability = vi.fn(async (model: string) => {
        // Primary (first in chain) unavailable, second available
        if (model === chain[0]) return false;
        return true;
      });

      const result = await initModelRouter({ checkAvailability });
      expect(result.text.model).toBe(chain[1]);
      expect(result.text.status).toBe('available');
      expect(result.text.fallbackUsed).toBe(chain[1]);
    });
  });

  // Requirement 3.3: imageHQ fallback chain
  describe('imageHQ fallback chain', () => {
    it('should use second model when primary imageHQ model is unavailable', async () => {
      const chain = FALLBACK_CHAINS.imageHQ!;
      const checkAvailability = vi.fn(async (model: string) => {
        if (model === chain[0]) return false;
        return true;
      });

      const result = await initModelRouter({ checkAvailability });
      expect(result.imageHQ.model).toBe(chain[1]);
      expect(result.imageHQ.status).toBe('available');
      expect(result.imageHQ.fallbackUsed).toBe(chain[1]);
    });
  });

  // Requirement 3.4: videoFinal fallback chain
  describe('videoFinal fallback chain', () => {
    it('should use second model when primary videoFinal model is unavailable', async () => {
      const chain = FALLBACK_CHAINS.videoFinal!;
      const checkAvailability = vi.fn(async (model: string) => {
        if (model === chain[0]) return false;
        return true;
      });

      const result = await initModelRouter({ checkAvailability });
      expect(result.videoFinal.model).toBe(chain[1]);
      expect(result.videoFinal.status).toBe('available');
      expect(result.videoFinal.fallbackUsed).toBe(chain[1]);
    });
  });

  // Requirement 3.8: all text models unavailable → degraded
  describe('all text models unavailable', () => {
    it('should mark text slot as degraded when all chain models are unavailable', async () => {
      const chain = FALLBACK_CHAINS.text!;
      const checkAvailability = vi.fn(async (model: string) => {
        // All text chain models unavailable, others available
        return !chain.includes(model);
      });

      const result = await initModelRouter({ checkAvailability });
      expect(result.text.status).toBe('degraded');
    });
  });
});
