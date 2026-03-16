/**
 * Property-based tests for the GenAI service model forwarding.
 *
 * Feature: vertex-ai-model-router, Property 4: generateContent forwards the provided model identifier
 *
 * "For any model identifier string passed to generateContent(prompt, model),
 * the underlying SDK call should use that exact model identifier — not a value
 * read from GcpConfig or any other source."
 *
 * Validates: Requirements 7.1, 7.2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockGenerateContent = vi.fn().mockResolvedValue({ text: 'response' });
  return { mockGenerateContent };
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: { generateContent: mocks.mockGenerateContent },
  })),
  Type: { STRING: 'STRING', OBJECT: 'OBJECT', NUMBER: 'NUMBER', INTEGER: 'INTEGER', BOOLEAN: 'BOOLEAN', ARRAY: 'ARRAY' },
}));

// Import after mocks are set up
import { generateContent } from '../services/genai';

// ── Test suite ──────────────────────────────────────────────────────

describe('GenAI Service Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Feature: vertex-ai-model-router, Property 4: generateContent forwards the provided model identifier
   *
   * **Validates: Requirements 7.1, 7.2**
   */
  describe('Property 4: generateContent forwards the provided model identifier', () => {
    it('passes the exact model string to the SDK generateContent call', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.stringOf(
            fc.constantFrom(
              ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._'.split(''),
            ),
            { minLength: 1, maxLength: 60 },
          ),
          async (randomModel) => {
            mocks.mockGenerateContent.mockClear();

            await generateContent('test prompt', randomModel);

            expect(mocks.mockGenerateContent).toHaveBeenCalledTimes(1);

            const callArg = mocks.mockGenerateContent.mock.calls[0][0];
            expect(callArg.model).toBe(randomModel);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
