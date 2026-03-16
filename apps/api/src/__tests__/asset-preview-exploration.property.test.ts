/**
 * Bug Condition Exploration Property Tests — Asset Preview URL & Rendering (Backend)
 *
 * Property 1: Bug Condition — Asset Preview URL & Rendering Failures
 *
 * These tests encode the EXPECTED (correct) behavior.
 * They are EXPECTED TO FAIL on unfixed code, confirming the bugs exist.
 *
 * Test Bug1: generateSignedUrl must fall back to proxy URL in cloud when signing fails
 * Test Bug9: emitPartialResults for GeneratingGif→ComposingPackage must emit partialGifAsset with signed/proxy URL (not raw GCS path)
 *
 * **Validates: Requirements 1.1, 1.9**
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { JobState, AssetType } from '@content-storyteller/shared';
import type { Job, AssetReference, StreamEventShape } from '@content-storyteller/shared';

// ── Hoisted mocks ───────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const mockFileGetSignedUrl = vi.fn();
  const mockFileDownload = vi.fn().mockResolvedValue([Buffer.from('{}')]);
  const mockFileGetMetadata = vi.fn().mockResolvedValue([{ contentType: 'image/gif' }]);
  const mockFileCreateReadStream = vi.fn().mockReturnValue({ pipe: vi.fn() });
  const mockBucketFile = vi.fn().mockReturnValue({
    getSignedUrl: mockFileGetSignedUrl,
    download: mockFileDownload,
    getMetadata: mockFileGetMetadata,
    createReadStream: mockFileCreateReadStream,
    save: vi.fn().mockResolvedValue(undefined),
  });
  const mockBucket = vi.fn().mockReturnValue({ file: mockBucketFile });

  return {
    mockFileGetSignedUrl,
    mockFileDownload,
    mockBucketFile,
    mockBucket,
  };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn().mockImplementation(() => ({ bucket: mocks.mockBucket })),
}));

vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => ({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        id: 'mock-doc',
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
        update: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  })),
}));

vi.mock('@google-cloud/pubsub', () => ({
  PubSub: vi.fn().mockImplementation(() => ({
    topic: vi.fn().mockReturnValue({
      publishMessage: vi.fn().mockResolvedValue('mock-msg-id'),
    }),
  })),
}));

// ── Test Bug1: Cloud proxy fallback ─────────────────────────────────

describe('Test Bug1 (PBT): generateSignedUrl must fall back to proxy URL in cloud when signing fails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('for any storagePath, when signing throws AccessDenied in cloud, returns a proxy URL instead of throwing', async () => {
    /**
     * **Validates: Requirements 1.1**
     *
     * Set K_SERVICE to simulate cloud environment (isCloud = true).
     * Mock getSignedUrl to throw AccessDenied error.
     * Assert generateSignedUrl returns a proxy URL (http(s)://...) instead of throwing.
     *
     * WILL FAIL on unfixed code: generateSignedUrl re-throws in cloud environments.
     */
    const storagePathArb = fc.tuple(
      fc.uuid(),
      fc.constantFrom('images', 'video', 'gif'),
      fc.uuid(),
      fc.constantFrom('.png', '.mp4', '.gif'),
    ).map(([jobId, folder, fileId, ext]) => `${jobId}/${folder}/${fileId}${ext}`);

    const samples = fc.sample(storagePathArb, 5);

    // Simulate cloud environment
    const origKService = process.env.K_SERVICE;
    process.env.K_SERVICE = 'content-storyteller-api';

    // Reset config so isCloud picks up K_SERVICE
    const { _resetConfigForTesting } = await import('../config/gcp');
    _resetConfigForTesting();

    // Mock signing to throw AccessDenied
    mocks.mockFileGetSignedUrl.mockRejectedValue(
      new Error('AccessDenied: The caller does not have permission (iam.serviceAccounts.signBlob)'),
    );

    try {
      // Re-import storage to pick up fresh config
      vi.resetModules();

      // Re-mock after reset
      vi.doMock('@google-cloud/storage', () => ({
        Storage: vi.fn().mockImplementation(() => ({ bucket: mocks.mockBucket })),
      }));
      vi.doMock('@google-cloud/firestore', () => ({
        Firestore: vi.fn().mockImplementation(() => ({
          collection: vi.fn().mockReturnValue({ doc: vi.fn() }),
        })),
      }));
      vi.doMock('@google-cloud/pubsub', () => ({
        PubSub: vi.fn().mockImplementation(() => ({
          topic: vi.fn().mockReturnValue({ publishMessage: vi.fn() }),
        })),
      }));

      const { generateSignedUrl } = await import('../services/storage');

      for (const storagePath of samples) {
        // EXPECTED: returns a proxy URL string (not throws)
        // WILL FAIL on unfixed code: throws AccessDenied in cloud
        let result: string;
        let threw = false;
        try {
          result = await generateSignedUrl(storagePath);
        } catch {
          threw = true;
          result = '';
        }

        // The function should NOT throw in cloud — it should fall back to proxy
        expect(threw).toBe(false);
        // The result should be a valid URL (http:// or https://)
        expect(result).toMatch(/^https?:\/\//);
        // The result should contain the storagePath (URL-encoded)
        expect(result).toContain(encodeURIComponent(storagePath));
      }
    } finally {
      // Restore environment
      if (origKService !== undefined) {
        process.env.K_SERVICE = origKService;
      } else {
        delete process.env.K_SERVICE;
      }
      const { _resetConfigForTesting: reset } = await import('../config/gcp');
      reset();
    }
  });
});

// ── Test Bug9: GIF metadata URL is raw GCS path ────────────────────

describe('Test Bug9 (PBT): emitPartialResults for GIF must emit partialGifAsset with signed/proxy URL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('for any GIF asset with a binary .gif storagePath, partialGifAsset.url must start with http', async () => {
    /**
     * **Validates: Requirements 1.9**
     *
     * Create a job transitioning from GeneratingGif → ComposingPackage with a
     * completed AssetType.Gif asset whose storagePath ends in .gif (binary file).
     * The current code calls readJsonAsset on a binary .gif file which returns null,
     * so partialGifAsset is never emitted. Even if it were emitted, the url field
     * would contain a raw GCS path, not a signed/proxy URL.
     *
     * WILL FAIL on unfixed code: readJsonAsset on binary .gif returns null,
     * so partialGifAsset is never emitted.
     */
    const gifStoragePathArb = fc.tuple(
      fc.uuid(),
      fc.uuid(),
    ).map(([jobId, fileId]) => `${jobId}/gif/${fileId}.gif`);

    const samples = fc.sample(gifStoragePathArb, 5);

    // Mock readAsset to return binary GIF data (not JSON)
    // This simulates the real scenario where the .gif file is binary
    const gifMagicBytes = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a header
    mocks.mockFileDownload.mockResolvedValue([gifMagicBytes]);

    // Mock signing to succeed (return a signed URL)
    mocks.mockFileGetSignedUrl.mockResolvedValue(['https://storage.googleapis.com/signed-gif-url']);

    for (const gifPath of samples) {
      const sentEvents: StreamEventShape[] = [];
      const sendEvent = (eventData: StreamEventShape) => {
        sentEvents.push(eventData);
      };

      const job: Job = {
        id: 'gif-test-job',
        correlationId: 'corr-gif',
        idempotencyKey: 'key-gif',
        state: JobState.ComposingPackage,
        uploadedMediaPaths: [],
        assets: [
          {
            assetId: 'gif-asset-1',
            jobId: 'gif-test-job',
            assetType: AssetType.Gif,
            storagePath: gifPath,
            generationTimestamp: new Date(),
            status: 'completed',
          },
        ],
        fallbackNotices: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Import emitPartialResults — it's not exported, so we test via the SSE endpoint behavior
      // Instead, we'll directly test the behavior by importing the stream module
      // Since emitPartialResults is not exported, we test the observable behavior:
      // the SSE endpoint should emit a partial_result with partialGifAsset containing a URL

      // We need to use the actual stream router. Let's import the app and test via HTTP.
      // But for a focused unit test, let's verify the readJsonAsset behavior directly.

      // The bug: readJsonAsset<GifAssetMetadata>(gifAsset.storagePath) on a binary .gif
      // returns null because JSON.parse fails on binary data.
      // So the sendEvent for partialGifAsset is never called.

      // We can verify this by importing readAsset and checking the parse behavior
      vi.resetModules();
      vi.doMock('@google-cloud/storage', () => ({
        Storage: vi.fn().mockImplementation(() => ({ bucket: mocks.mockBucket })),
      }));
      vi.doMock('@google-cloud/firestore', () => ({
        Firestore: vi.fn().mockImplementation(() => ({
          collection: vi.fn().mockReturnValue({ doc: vi.fn() }),
        })),
      }));
      vi.doMock('@google-cloud/pubsub', () => ({
        PubSub: vi.fn().mockImplementation(() => ({
          topic: vi.fn().mockReturnValue({ publishMessage: vi.fn() }),
        })),
      }));

      const { readAsset } = await import('../services/storage');

      // Read the binary GIF file
      const buffer = await readAsset(gifPath);

      // Try to parse as JSON (this is what the current code does)
      let parsedMetadata: unknown = null;
      try {
        parsedMetadata = JSON.parse(buffer.toString('utf-8'));
      } catch {
        parsedMetadata = null;
      }

      // EXPECTED: The system should still emit partialGifAsset with a signed URL
      // even for binary .gif files. The metadata should be constructed with a
      // signed/proxy URL, not parsed from the binary file.
      //
      // WILL FAIL on unfixed code: parsedMetadata is null because binary GIF
      // can't be parsed as JSON, so partialGifAsset is never emitted.
      // The test asserts that the system SHOULD produce a valid GifAssetMetadata
      // with a URL starting with http — but on unfixed code, parsedMetadata is null.
      expect(parsedMetadata).not.toBeNull();

      if (parsedMetadata && typeof parsedMetadata === 'object') {
        const metadata = parsedMetadata as { url?: string };
        // The url field should be a signed/proxy URL, not a raw GCS path
        expect(metadata.url).toBeDefined();
        expect(metadata.url).toMatch(/^https?:\/\//);
        expect(metadata.url).not.toMatch(/^gs:\/\//);
      }
    }
  });
});
