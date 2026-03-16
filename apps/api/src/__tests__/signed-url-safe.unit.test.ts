import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for generateSignedUrlSafe — the non-throwing variant of
 * generateSignedUrl that returns { url, error? } instead of throwing.
 *
 * Validates: Requirements 14.1, 14.2, 15.1
 */

describe('generateSignedUrlSafe', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns { url } on success (delegates to generateSignedUrl)', async () => {
    const expectedUrl = 'https://storage.googleapis.com/test-assets/jobs/1/img.png?sig=abc';
    const mockGetSignedUrl = vi.fn().mockResolvedValue([expectedUrl]);

    vi.doMock('../config/gcp', () => ({
      getGcpConfig: () => ({
        projectId: 'test-project',
        location: 'us-central1',
        firestoreDatabase: '(default)',
        uploadsBucket: 'test-uploads',
        assetsBucket: 'test-assets',
        pubsubTopic: 'test-topic',
        geminiApiKey: '',
        isCloud: true,
        authMode: 'adc-service-account' as const,
      }),
      _resetConfigForTesting: () => {},
    }));

    vi.doMock('@google-cloud/storage', () => ({
      Storage: vi.fn().mockImplementation(() => ({
        bucket: () => ({
          file: () => ({
            getSignedUrl: mockGetSignedUrl,
          }),
        }),
      })),
    }));

    const { generateSignedUrlSafe } = await import('../services/storage');
    const result = await generateSignedUrlSafe('jobs/1/img.png');

    expect(result.url).toBe(expectedUrl);
    expect(result.error).toBeUndefined();
  });

  it('returns { url: "", error } and never throws when signing fails in cloud without API_BASE_URL', async () => {
    const signingError = new Error('Cannot sign URL without service account credentials');

    vi.doMock('../config/gcp', () => ({
      getGcpConfig: () => ({
        projectId: 'test-project',
        location: 'us-central1',
        firestoreDatabase: '(default)',
        uploadsBucket: 'test-uploads',
        assetsBucket: 'test-assets',
        pubsubTopic: 'test-topic',
        geminiApiKey: '',
        isCloud: true,
        authMode: 'adc-service-account' as const,
      }),
      _resetConfigForTesting: () => {},
    }));

    vi.doMock('@google-cloud/storage', () => ({
      Storage: vi.fn().mockImplementation(() => ({
        bucket: () => ({
          file: () => ({
            getSignedUrl: vi.fn().mockRejectedValue(signingError),
          }),
        }),
      })),
    }));

    // Ensure no API_BASE_URL fallback
    delete process.env.API_BASE_URL;

    const { generateSignedUrlSafe } = await import('../services/storage');
    const result = await generateSignedUrlSafe('jobs/42/video/clip.mp4');

    expect(result.url).toBe('');
    expect(result.error).toBe('Cannot sign URL without service account credentials');
  });

  it('returns proxy URL (no error) when signing fails in local dev', async () => {
    vi.doMock('../config/gcp', () => ({
      getGcpConfig: () => ({
        projectId: 'test-project',
        location: 'us-central1',
        firestoreDatabase: '(default)',
        uploadsBucket: 'test-uploads',
        assetsBucket: 'test-assets',
        pubsubTopic: 'test-topic',
        geminiApiKey: '',
        isCloud: false,
        authMode: 'adc-user' as const,
      }),
      _resetConfigForTesting: () => {},
    }));

    vi.doMock('@google-cloud/storage', () => ({
      Storage: vi.fn().mockImplementation(() => ({
        bucket: () => ({
          file: () => ({
            getSignedUrl: vi.fn().mockRejectedValue(new Error('SigningError')),
          }),
        }),
      })),
    }));

    const { generateSignedUrlSafe } = await import('../services/storage');
    const result = await generateSignedUrlSafe('jobs/7/gif/anim.gif');

    // In local dev, generateSignedUrl itself falls back to localhost proxy — no error
    expect(result.url).toMatch(/^http:\/\/localhost:\d+\/api\/v1\/assets\//);
    expect(result.error).toBeUndefined();
  });

  it('surfaces the error reason string, not the full Error object', async () => {
    vi.doMock('../config/gcp', () => ({
      getGcpConfig: () => ({
        projectId: 'p',
        location: 'us-central1',
        firestoreDatabase: '(default)',
        uploadsBucket: 'u',
        assetsBucket: 'a',
        pubsubTopic: 't',
        geminiApiKey: '',
        isCloud: true,
        authMode: 'adc-service-account' as const,
      }),
      _resetConfigForTesting: () => {},
    }));

    vi.doMock('@google-cloud/storage', () => ({
      Storage: vi.fn().mockImplementation(() => ({
        bucket: () => ({
          file: () => ({
            getSignedUrl: vi.fn().mockRejectedValue(new Error('AccessDenied: 403')),
          }),
        }),
      })),
    }));

    delete process.env.API_BASE_URL;

    const { generateSignedUrlSafe } = await import('../services/storage');
    const result = await generateSignedUrlSafe('some/path.png');

    expect(typeof result.error).toBe('string');
    expect(result.error).toBe('AccessDenied: 403');
  });
});
