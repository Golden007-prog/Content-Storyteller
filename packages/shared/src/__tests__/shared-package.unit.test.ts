import { describe, it, expect } from 'vitest';
import {
  // Types - job
  JobState,
  AssetType,
  // Types - api
  // (these are interfaces, so we just verify they're importable via type-level usage)
  // Types - messages
  // Schemas
} from '../index';

// Also import everything to verify barrel export works
import * as SharedExports from '../index';

describe('JobState enum', () => {
  it('contains all required pipeline states', () => {
    expect(JobState.Queued).toBe('queued');
    expect(JobState.ProcessingInput).toBe('processing_input');
    expect(JobState.GeneratingCopy).toBe('generating_copy');
    expect(JobState.GeneratingImages).toBe('generating_images');
    expect(JobState.GeneratingVideo).toBe('generating_video');
    expect(JobState.ComposingPackage).toBe('composing_package');
    expect(JobState.Completed).toBe('completed');
    expect(JobState.Failed).toBe('failed');
  });

  it('has exactly 9 values', () => {
    const values = Object.values(JobState);
    expect(values).toHaveLength(9);
  });
});

describe('AssetType enum', () => {
  it('contains all required asset types', () => {
    expect(AssetType.Copy).toBe('copy');
    expect(AssetType.Image).toBe('image');
    expect(AssetType.Video).toBe('video');
    expect(AssetType.Storyboard).toBe('storyboard');
    expect(AssetType.VoiceoverScript).toBe('voiceover_script');
  });

  it('has exactly 9 values', () => {
    const values = Object.values(AssetType);
    expect(values).toHaveLength(9);
  });
});

describe('Barrel export (index.ts)', () => {
  it('exports JobState and AssetType enums', () => {
    expect(SharedExports.JobState).toBeDefined();
    expect(SharedExports.AssetType).toBeDefined();
  });

  it('exports all expected symbols', () => {
    const expectedExports = [
      // Enums
      'JobState',
      'AssetType',
    ];

    for (const name of expectedExports) {
      expect(SharedExports).toHaveProperty(name);
    }
  });
});
