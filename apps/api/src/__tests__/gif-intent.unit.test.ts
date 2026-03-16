/**
 * Unit tests for GIF intent detection in the Output-Intent Planner.
 *
 * Feature: linkedin-gif-generator
 * Covers: Requirements 1.2, 1.3, 1.4, 1.7
 */
import { describe, it, expect } from 'vitest';
import { Platform, Tone, OutputPreference } from '@content-storyteller/shared';
import { resolveOutputIntent, PlannerInput } from '../services/planner/output-intent';

describe('GIF Intent Detection Unit Tests', () => {
  /**
   * Requirement 1.2: WHEN the user prompt contains GIF keywords,
   * THE Output_Intent_Planner SHALL set wantsGif to true.
   */
  describe('GIF keyword detection in prompt', () => {
    it('"make me a gif" sets wantsGif to true', () => {
      const input: PlannerInput = {
        promptText: 'make me a gif for my LinkedIn post',
        platform: Platform.LinkedInLaunchPost,
        tone: Tone.Professional,
        uploadedMediaPaths: [],
      };

      const intent = resolveOutputIntent(input);

      expect(intent.wantsGif).toBe(true);
    });

    it('"looping animation" sets wantsGif to true', () => {
      const input: PlannerInput = {
        promptText: 'Create a looping animation of our workflow',
        platform: Platform.LinkedInLaunchPost,
        tone: Tone.Professional,
        uploadedMediaPaths: [],
      };

      const intent = resolveOutputIntent(input);

      expect(intent.wantsGif).toBe(true);
    });

    it('"animated explainer" sets wantsGif to true', () => {
      const input: PlannerInput = {
        promptText: 'I need an animated explainer for this diagram',
        platform: Platform.LinkedInLaunchPost,
        tone: Tone.Sleek,
        uploadedMediaPaths: [],
      };

      const intent = resolveOutputIntent(input);

      expect(intent.wantsGif).toBe(true);
    });
  });

  /**
   * Requirement 1.3: WHEN the user selects CopyGif preference,
   * THE Output_Intent_Planner SHALL set wantsGif=true, wantsVideo=false, wantsImage=false.
   */
  describe('CopyGif preference mapping', () => {
    it('CopyGif sets wantsGif=true, wantsVideo=false, wantsImage=false', () => {
      const input: PlannerInput = {
        promptText: 'Generate content for my product launch',
        platform: Platform.LinkedInLaunchPost,
        tone: Tone.Professional,
        uploadedMediaPaths: [],
        outputPreference: OutputPreference.CopyGif,
      };

      const intent = resolveOutputIntent(input);

      expect(intent.wantsGif).toBe(true);
      expect(intent.wantsVideo).toBe(false);
      expect(intent.wantsImage).toBe(false);
      expect(intent.wantsCopy).toBe(true);
    });
  });

  /**
   * Requirement 1.4: WHEN the user selects FullPackage preference,
   * THE Output_Intent_Planner SHALL set wantsGif=true alongside wantsImage=true and wantsVideo=true.
   */
  describe('FullPackage preference includes GIF', () => {
    it('FullPackage sets wantsGif=true, wantsImage=true, wantsVideo=true', () => {
      const input: PlannerInput = {
        promptText: 'Create a complete campaign package',
        platform: Platform.LinkedInLaunchPost,
        tone: Tone.Punchy,
        uploadedMediaPaths: [],
        outputPreference: OutputPreference.FullPackage,
      };

      const intent = resolveOutputIntent(input);

      expect(intent.wantsGif).toBe(true);
      expect(intent.wantsImage).toBe(true);
      expect(intent.wantsVideo).toBe(true);
      expect(intent.wantsCopy).toBe(true);
    });
  });

  /**
   * Requirement 1.7: THE Output_Intent_Planner SHALL NOT set wantsVideo to true
   * when only a GIF is requested and no explicit video keywords are present.
   */
  describe('GIF keywords without video keywords do not enable video', () => {
    it('prompt with "gif" but no video keywords keeps wantsVideo=false', () => {
      const input: PlannerInput = {
        promptText: 'Create a gif showing our architecture diagram',
        platform: Platform.LinkedInLaunchPost,
        tone: Tone.Professional,
        uploadedMediaPaths: [],
      };

      const intent = resolveOutputIntent(input);

      expect(intent.wantsGif).toBe(true);
      expect(intent.wantsVideo).toBe(false);
    });

    it('prompt with "motion graphic" but no video keywords keeps wantsVideo=false', () => {
      const input: PlannerInput = {
        promptText: 'Turn this into a motion graphic for LinkedIn',
        platform: Platform.LinkedInLaunchPost,
        tone: Tone.Sleek,
        uploadedMediaPaths: [],
      };

      const intent = resolveOutputIntent(input);

      expect(intent.wantsGif).toBe(true);
      expect(intent.wantsVideo).toBe(false);
    });

    it('prompt with both "gif" and "video" keywords enables both', () => {
      const input: PlannerInput = {
        promptText: 'Create a gif and a video teaser for our launch',
        platform: Platform.LinkedInLaunchPost,
        tone: Tone.Professional,
        uploadedMediaPaths: [],
      };

      const intent = resolveOutputIntent(input);

      expect(intent.wantsGif).toBe(true);
      expect(intent.wantsVideo).toBe(true);
    });
  });
});
