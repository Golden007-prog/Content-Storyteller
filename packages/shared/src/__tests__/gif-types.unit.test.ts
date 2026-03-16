/**
 * Unit tests for GIF shared type extensions.
 *
 * Verifies enum values, OutputIntent field, and StepsMap entry
 * added for the LinkedIn GIF Generator feature.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 */
import { describe, it, expect } from 'vitest';
import {
  AssetType,
  JobState,
  OutputPreference,
} from '../index';
import type { OutputIntent, StepsMap } from '../index';

describe('GIF shared type extensions', () => {
  describe('AssetType enum', () => {
    it('includes Gif with value "gif"', () => {
      expect(AssetType.Gif).toBe('gif');
    });
  });

  describe('JobState enum', () => {
    it('includes GeneratingGif with value "generating_gif"', () => {
      expect(JobState.GeneratingGif).toBe('generating_gif');
    });
  });

  describe('OutputPreference enum', () => {
    it('includes CopyGif with value "copy_gif"', () => {
      expect(OutputPreference.CopyGif).toBe('copy_gif');
    });
  });

  describe('OutputIntent interface', () => {
    it('accepts wantsGif boolean field', () => {
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
        wantsGif: true,
      };
      expect(intent.wantsGif).toBe(true);
    });
  });

  describe('StepsMap interface', () => {
    it('accepts generateGif step with StepMetadata', () => {
      const steps: StepsMap = {
        processInput: { status: 'completed' },
        generateCopy: { status: 'completed' },
        generateImages: { status: 'skipped' },
        generateVideo: { status: 'skipped' },
        generateGif: { status: 'running' },
        composePackage: { status: 'queued' },
      };
      expect(steps.generateGif).toBeDefined();
      expect(steps.generateGif.status).toBe('running');
    });
  });
});
