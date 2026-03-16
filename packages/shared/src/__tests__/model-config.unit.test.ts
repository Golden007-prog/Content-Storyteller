/**
 * Unit tests for model configuration defaults.
 *
 * Validates: Requirements 1.1, 1.2, 1.11
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getModelConfig, _resetConfigForTesting } from '../ai/model-config';

// Track env vars set during tests for cleanup
const ENV_VARS_TO_CLEAN = ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION'];

describe('Model Config Defaults', () => {
  beforeEach(() => {
    _resetConfigForTesting();
    for (const v of ENV_VARS_TO_CLEAN) {
      delete process.env[v];
    }
  });

  afterEach(() => {
    for (const v of ENV_VARS_TO_CLEAN) {
      delete process.env[v];
    }
    _resetConfigForTesting();
  });

  // Requirement 1.11: default model identifiers per slot
  describe('slot defaults (Requirement 1.11)', () => {
    it('should return gemini-3-flash-preview for text slot', () => {
      expect(getModelConfig().slots.text).toBe('gemini-3-flash-preview');
    });

    it('should return gemini-3-flash-preview for textFallback slot', () => {
      expect(getModelConfig().slots.textFallback).toBe('gemini-3-flash-preview');
    });

    it('should return gemini-3.1-pro-preview for reasoning slot', () => {
      expect(getModelConfig().slots.reasoning).toBe('gemini-3.1-pro-preview');
    });

    it('should return gemini-3.1-flash-image-preview for image slot', () => {
      expect(getModelConfig().slots.image).toBe('gemini-3.1-flash-image-preview');
    });

    it('should return gemini-3-pro-image-preview for imageHQ slot', () => {
      expect(getModelConfig().slots.imageHQ).toBe('gemini-3-pro-image-preview');
    });

    it('should return veo-3.1-fast-generate-001 for videoFast slot', () => {
      expect(getModelConfig().slots.videoFast).toBe('veo-3.1-fast-generate-001');
    });

    it('should return veo-3.1-generate-001 for videoFinal slot', () => {
      expect(getModelConfig().slots.videoFinal).toBe('veo-3.1-generate-001');
    });

    it('should return gemini-live-2.5-flash-native-audio for live slot', () => {
      expect(getModelConfig().slots.live).toBe('gemini-live-2.5-flash-native-audio');
    });
  });

  // Requirement 1.1: CapabilitySlot identifiers, Requirement 1.2: projectId and location
  describe('projectId and location resolution (Requirements 1.1, 1.2)', () => {
    it('should resolve projectId from GOOGLE_CLOUD_PROJECT', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'my-test-project';
      _resetConfigForTesting();
      expect(getModelConfig().projectId).toBe('my-test-project');
    });

    it('should resolve location from GOOGLE_CLOUD_LOCATION', () => {
      process.env.GOOGLE_CLOUD_LOCATION = 'europe-west1';
      _resetConfigForTesting();
      expect(getModelConfig().location).toBe('europe-west1');
    });

    it('should default projectId to empty string when GOOGLE_CLOUD_PROJECT is not set', () => {
      expect(getModelConfig().projectId).toBe('');
    });

    it('should default location to us-central1 when GOOGLE_CLOUD_LOCATION is not set', () => {
      expect(getModelConfig().location).toBe('us-central1');
    });
  });
});
