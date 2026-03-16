/**
 * Unit tests for pipeline stage model routing.
 *
 * Verifies that each pipeline stage calls getModel() with the correct
 * capability slot and passes the returned model to generateContent().
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.6
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobState, PipelineContext } from '@content-storyteller/shared';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const getModelSpy = vi.fn().mockReturnValue('test-routed-model');
  const generateContentSpy = vi.fn().mockResolvedValue(
    JSON.stringify({
      targetAudience: 'General audience',
      tone: 'Professional',
      keyMessages: ['Key message'],
      visualDirection: 'Modern and clean',
      inputSummary: 'Test summary',
      campaignAngle: 'Test angle',
      pacing: 'Balanced',
      visualStyle: 'Modern',
    }),
  );

  const getJobSpy = vi.fn().mockResolvedValue({
    id: 'test-job',
    promptText: 'Test prompt',
    platform: 'general_promo_package',
    tone: 'professional',
  });
  const updateJobStateSpy = vi.fn().mockResolvedValue(undefined);
  const recordAssetReferenceSpy = vi.fn().mockResolvedValue(undefined);
  const recordFallbackNoticeSpy = vi.fn().mockResolvedValue(undefined);
  const writeAssetSpy = vi.fn().mockResolvedValue('gs://test-bucket/path');
  const capabilityIsAvailableSpy = vi.fn().mockResolvedValue(false);

  return {
    getModelSpy,
    generateContentSpy,
    getJobSpy,
    updateJobStateSpy,
    recordAssetReferenceSpy,
    recordFallbackNoticeSpy,
    writeAssetSpy,
    capabilityIsAvailableSpy,
  };
});

// ── Module mocks ────────────────────────────────────────────────────

vi.mock('@content-storyteller/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@content-storyteller/shared')>();
  return {
    ...actual,
    getModel: mocks.getModelSpy,
  };
});

vi.mock('../services/genai', () => ({
  generateContent: mocks.generateContentSpy,
  generateContentMultimodal: mocks.generateContentSpy,
}));

vi.mock('../services/firestore', () => ({
  getJob: mocks.getJobSpy,
  updateJobState: mocks.updateJobStateSpy,
  recordAssetReference: mocks.recordAssetReferenceSpy,
  recordFallbackNotice: mocks.recordFallbackNoticeSpy,
}));

vi.mock('../services/storage', () => ({
  writeAsset: mocks.writeAssetSpy,
  readUpload: vi.fn().mockResolvedValue(Buffer.from('mock')),
}));

vi.mock('../middleware/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../capabilities/capability-registry', () => ({
  capabilityRegistry: {
    get: () => ({
      name: 'mock_capability',
      isAvailable: mocks.capabilityIsAvailableSpy,
      generate: vi.fn().mockResolvedValue({ success: false, assets: [], metadata: {} }),
    }),
    has: () => false,
    init: vi.fn(),
    all: vi.fn().mockReturnValue([]),
    register: vi.fn(),
  },
}));

// ── Imports under test (after mocks) ────────────────────────────────

import { ProcessInput } from '../pipeline/process-input';
import { GenerateCopy } from '../pipeline/generate-copy';
import { GenerateImages } from '../pipeline/generate-images';
import { GenerateVideo } from '../pipeline/generate-video';

// ── Helpers ─────────────────────────────────────────────────────────

function makeContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    jobId: 'routing-test-job',
    correlationId: 'routing-corr',
    uploadedMediaPaths: [],
    workingData: {
      creativeBrief: {
        targetAudience: 'Developers',
        tone: 'Professional',
        keyMessages: ['Ship fast'],
        visualDirection: 'Clean and modern',
        inputSummary: 'Test input',
      },
    },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Pipeline stage model routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getModelSpy.mockReturnValue('test-routed-model');
    mocks.generateContentSpy.mockResolvedValue(
      JSON.stringify({
        targetAudience: 'General audience',
        tone: 'Professional',
        keyMessages: ['Key message'],
        visualDirection: 'Modern and clean',
        inputSummary: 'Test summary',
        campaignAngle: 'Test angle',
        pacing: 'Balanced',
        visualStyle: 'Modern',
      }),
    );
    mocks.capabilityIsAvailableSpy.mockResolvedValue(false);
  });

  // Req 4.1: ProcessInput uses textModel
  describe('ProcessInput stage', () => {
    it('calls getModel with "text" slot and passes result to generateContent', async () => {
      const stage = new ProcessInput();
      await stage.execute(makeContext());

      expect(mocks.getModelSpy).toHaveBeenCalledWith('text');
      expect(mocks.generateContentSpy).toHaveBeenCalledWith(
        expect.any(String),
        'test-routed-model',
      );
    });
  });

  // Req 4.2: GenerateCopy uses textModel
  describe('GenerateCopy stage', () => {
    it('calls getModel with "text" slot and passes result to generateContent', async () => {
      mocks.generateContentSpy.mockResolvedValue(
        JSON.stringify({
          hook: 'Hook',
          caption: 'Caption',
          cta: 'CTA',
          hashtags: ['tag'],
          threadCopy: ['Thread'],
          voiceoverScript: 'Script',
          onScreenText: ['Text'],
        }),
      );

      const stage = new GenerateCopy();
      await stage.execute(makeContext());

      expect(mocks.getModelSpy).toHaveBeenCalledWith('text');
      expect(mocks.generateContentSpy).toHaveBeenCalledWith(
        expect.any(String),
        'test-routed-model',
      );
    });
  });

  // Req 4.3: GenerateImages uses textModel for concept generation
  describe('GenerateImages stage', () => {
    it('calls getModel with "text" slot for concept generation and passes result to generateContent', async () => {
      mocks.generateContentSpy.mockResolvedValue(
        JSON.stringify([
          { conceptName: 'C1', visualDirection: 'V1', generationPrompt: 'P1', style: 'photorealistic' },
        ]),
      );

      const stage = new GenerateImages();
      await stage.execute(makeContext());

      expect(mocks.getModelSpy).toHaveBeenCalledWith('text');
      expect(mocks.generateContentSpy).toHaveBeenCalledWith(
        expect.any(String),
        'test-routed-model',
      );
    });
  });

  // Req 4.6: GenerateVideo uses reasoningModel for storyboard
  describe('GenerateVideo stage', () => {
    it('calls getModel with "reasoning" slot for storyboard generation and passes result to generateContent', async () => {
      mocks.generateContentSpy.mockResolvedValue(
        JSON.stringify({
          storyboard: {
            scenes: [{ sceneNumber: 1, description: 'Scene', duration: '5s', motionStyle: 'steady', textOverlay: '', cameraDirection: 'wide' }],
            totalDuration: '25s',
            pacing: 'balanced',
          },
          videoBrief: {
            totalDuration: '25s',
            motionStyle: 'smooth',
            textOverlayStyle: 'bold',
            cameraDirection: 'mixed',
            energyDirection: 'builds',
          },
        }),
      );

      const stage = new GenerateVideo();
      await stage.execute(makeContext());

      expect(mocks.getModelSpy).toHaveBeenCalledWith('reasoning');
      expect(mocks.generateContentSpy).toHaveBeenCalledWith(
        expect.any(String),
        'test-routed-model',
      );
    });
  });
});
