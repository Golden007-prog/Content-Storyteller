/**
 * Unit tests for the Planner module (resolveOutputIntent).
 *
 * Feature: smart-pipeline-orchestration
 * Covers: Requirements 3.3, 3.5, 3.6, 3.7, 3.8, 5.1, 5.2
 */
import { describe, it, expect } from 'vitest';
import { Platform, Tone, OutputPreference } from '@content-storyteller/shared';
import { resolveOutputIntent, PlannerInput } from '../services/planner/output-intent';

describe('Output Intent Planner Unit Tests', () => {
  /**
   * Requirement 3.3: WHEN the user prompt requests only a LinkedIn post with
   * hashtags and description, THE Planner SHALL set wantsCopy and wantsHashtags
   * to true and wantsImage and wantsVideo to false.
   *
   * Requirement 3.5: WHEN the user prompt requests only text-based output,
   * THE Planner SHALL set wantsImage to false.
   */
  describe('LinkedIn post prompt → copy-only intent', () => {
    it('produces copy-only intent for a LinkedIn text prompt', () => {
      const input: PlannerInput = {
        promptText: 'Write a professional LinkedIn post about our product launch',
        platform: Platform.LinkedInLaunchPost,
        tone: Tone.Professional,
        uploadedMediaPaths: [],
      };

      const intent = resolveOutputIntent(input);

      expect(intent.wantsCopy).toBe(true);
      expect(intent.wantsHashtags).toBe(true);
      expect(intent.wantsLinkedInPost).toBe(true);
      expect(intent.wantsImage).toBe(false);
      expect(intent.wantsVideo).toBe(false);
    });
  });

  /**
   * Requirement 3.6: WHEN the selected platform is instagram_reel,
   * THE Planner SHALL default to video-oriented output with wantsVideo true.
   *
   * Requirement 3.8: WHEN the user prompt requests a "complete package",
   * THE Planner SHALL set wantsCopy, wantsImage, and wantsVideo to true.
   */
  describe('Instagram reel prompt → video+image intent', () => {
    it('produces video and image intent for an Instagram reel prompt', () => {
      const input: PlannerInput = {
        promptText: 'Create engaging content for our summer campaign',
        platform: Platform.InstagramReel,
        tone: Tone.Punchy,
        uploadedMediaPaths: [],
      };

      const intent = resolveOutputIntent(input);

      expect(intent.wantsCopy).toBe(true);
      expect(intent.wantsVideo).toBe(true);
      expect(intent.wantsImage).toBe(true);
      expect(intent.wantsStoryboard).toBe(true);
      expect(intent.wantsVoiceover).toBe(true);
    });
  });

  /**
   * Requirement 3.7: WHEN the user prompt requests only copy,
   * THE Planner SHALL set wantsImage and wantsVideo to false.
   *
   * But video keywords in the prompt override platform defaults.
   */
  describe('Prompt with "video" keyword overrides copy-only platform default', () => {
    it('video keyword in prompt enables wantsVideo even on LinkedIn', () => {
      const input: PlannerInput = {
        promptText: 'Create a video teaser for our LinkedIn product launch',
        platform: Platform.LinkedInLaunchPost,
        tone: Tone.Professional,
        uploadedMediaPaths: [],
      };

      const intent = resolveOutputIntent(input);

      expect(intent.wantsCopy).toBe(true);
      expect(intent.wantsVideo).toBe(true);
      expect(intent.wantsStoryboard).toBe(true);
      expect(intent.wantsVoiceover).toBe(true);
    });
  });

  /**
   * Requirement 5.1, 5.2: THE Frontend SHALL display an optional output
   * preference control. Explicit preference overrides prompt inference.
   *
   * Requirement 3.13: WHEN explicit output flags are provided,
   * THE Planner SHALL use the explicit flags and override prompt-based inference.
   */
  describe('Explicit copy_only preference ignores video keywords in prompt', () => {
    it('copy_only preference forces wantsImage and wantsVideo to false despite video keyword', () => {
      const input: PlannerInput = {
        promptText: 'Make a video reel with stunning visuals for our campaign',
        platform: Platform.InstagramReel,
        tone: Tone.Cinematic,
        uploadedMediaPaths: [],
        outputPreference: OutputPreference.CopyOnly,
      };

      const intent = resolveOutputIntent(input);

      expect(intent.wantsCopy).toBe(true);
      expect(intent.wantsImage).toBe(false);
      expect(intent.wantsVideo).toBe(false);
    });
  });

  /**
   * Requirement 3.12: WHEN a trend is passed from the Trend Analyzer,
   * THE Planner SHALL respect the user's selected desired output type
   * from the trend context.
   */
  describe('Trend context with desiredOutputType overrides platform defaults', () => {
    it('trendContext desiredOutputType "video" overrides LinkedIn copy-only default', () => {
      const input: PlannerInput = {
        promptText: 'Write about the latest tech trends',
        platform: Platform.LinkedInLaunchPost,
        tone: Tone.Professional,
        uploadedMediaPaths: [],
        outputPreference: OutputPreference.Auto,
        trendContext: { desiredOutputType: 'video' },
      };

      const intent = resolveOutputIntent(input);

      expect(intent.wantsCopy).toBe(true);
      expect(intent.wantsVideo).toBe(true);
      expect(intent.wantsStoryboard).toBe(true);
      expect(intent.wantsVoiceover).toBe(true);
    });

    it('trendContext desiredOutputType "image" overrides X/Twitter thread default', () => {
      const input: PlannerInput = {
        promptText: 'Share insights about design patterns',
        platform: Platform.XTwitterThread,
        tone: Tone.Sleek,
        uploadedMediaPaths: [],
        outputPreference: OutputPreference.Auto,
        trendContext: { desiredOutputType: 'image' },
      };

      const intent = resolveOutputIntent(input);

      expect(intent.wantsCopy).toBe(true);
      expect(intent.wantsImage).toBe(true);
      expect(intent.wantsThread).toBe(true);
    });

    it('trendContext desiredOutputType "copy" keeps image and video false', () => {
      const input: PlannerInput = {
        promptText: 'Summarize the latest AI developments',
        platform: Platform.GeneralPromoPackage,
        tone: Tone.Professional,
        uploadedMediaPaths: [],
        outputPreference: OutputPreference.Auto,
        trendContext: { desiredOutputType: 'copy' },
      };

      const intent = resolveOutputIntent(input);

      expect(intent.wantsCopy).toBe(true);
      expect(intent.wantsImage).toBe(false);
      expect(intent.wantsVideo).toBe(false);
    });
  });
});
