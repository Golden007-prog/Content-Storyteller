/**
 * Media Rendering Integration Property Tests — Media Pipeline Asset Fix
 *
 * Property 7: Bug Condition — Frontend Renders Media with Signed URLs
 *
 * These tests verify that OutputDashboard and its child components
 * correctly render image thumbnails, HTML5 video players, and inline
 * GIF previews when provided with signed media URLs.
 *
 * **Validates: Requirements 17.1, 17.2, 17.3**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { render } from '@testing-library/react';
import { OutputDashboard } from '../components/OutputDashboard';
import type {
  CopyPackage,
  Storyboard,
  VideoBrief,
  GifAssetMetadata,
} from '@content-storyteller/shared';

// ── Helpers ─────────────────────────────────────────────────────────

function mkCopy(): Partial<CopyPackage> {
  return { hook: 'Hook', caption: 'Caption', hashtags: ['#tag'], cta: 'CTA' };
}

function mkStoryboard(): Partial<Storyboard> {
  return {
    scenes: [
      {
        sceneNumber: 1,
        description: 'Scene one',
        duration: '5s',
        motionStyle: 'smooth',
        textOverlay: 'Overlay',
        cameraDirection: 'pan',
      },
    ],
    totalDuration: '15s',
    pacing: 'balanced',
  };
}

function mkVideoBrief(): Partial<VideoBrief> {
  return {
    totalDuration: '15s',
    motionStyle: 'smooth',
    textOverlayStyle: 'bold',
    cameraDirection: 'medium',
    energyDirection: 'energetic',
  };
}

// ── Arbitraries ─────────────────────────────────────────────────────

/** Generates realistic signed URLs for media assets */
const signedUrlArb = fc
  .tuple(
    fc.constantFrom(
      'https://storage.googleapis.com/bucket/assets',
      'https://cdn.example.com/media',
    ),
    fc.stringOf(fc.constantFrom(...'abcdef0123456789'.split('')), {
      minLength: 8,
      maxLength: 16,
    }),
  )
  .map(([base, id]) => `${base}/${id}`);

const imageUrlArb = signedUrlArb.map((u) => `${u}.png`);
const videoUrlArb = signedUrlArb.map((u) => `${u}.mp4`);
const gifUrlArb = signedUrlArb.map((u) => `${u}.gif`);

/** Generates a GifAssetMetadata with a renderable (non-JSON) URL */
const gifAssetArb = gifUrlArb.map(
  (url): GifAssetMetadata => ({
    url,
    mimeType: 'image/gif',
    width: 480,
    height: 270,
    durationMs: 3000,
    loop: true,
    fileSizeBytes: 512000,
  }),
);


// ── Property 1: Image rendering ─────────────────────────────────────

describe('Property 7a (PBT): Image thumbnails render with correct src attributes', () => {
  it('for any set of image URLs, OutputDashboard renders img elements with correct src', () => {
    /**
     * **Validates: Requirements 17.1**
     *
     * When imageUrls are provided, VisualDirection (rendered inside
     * OutputDashboard) must render <img> elements whose src attributes
     * match the provided URLs.
     */
    fc.assert(
      fc.property(
        fc.array(imageUrlArb, { minLength: 1, maxLength: 4 }),
        (urls) => {
          const { container, unmount } = render(
            <OutputDashboard
              copyPackage={mkCopy()}
              storyboard={mkStoryboard()}
              videoBrief={mkVideoBrief()}
              imageConcepts={[]}
              imageUrls={urls}
            />,
          );

          const imgElements = Array.from(container.querySelectorAll('img'));
          const srcs = imgElements.map((el) => el.getAttribute('src'));

          // Every provided URL must appear as an img src
          for (const url of urls) {
            expect(srcs).toContain(url);
          }

          // Each image should have an alt attribute
          for (const img of imgElements) {
            const src = img.getAttribute('src');
            if (urls.includes(src ?? '')) {
              expect(img.getAttribute('alt')).toBeTruthy();
            }
          }

          unmount();
        },
      ),
      { numRuns: 15 },
    );
  });
});

// ── Property 2: Video rendering ─────────────────────────────────────

describe('Property 7b (PBT): HTML5 video player renders with correct src', () => {
  it('for any video URL, OutputDashboard renders a video element with controls', () => {
    /**
     * **Validates: Requirements 17.2**
     *
     * When videoUrl is provided, VideoBriefView (via VideoPlayer)
     * must render a <video> element with the controls attribute and
     * the correct src.
     */
    fc.assert(
      fc.property(videoUrlArb, (url) => {
        const { container, unmount } = render(
          <OutputDashboard
            copyPackage={mkCopy()}
            storyboard={mkStoryboard()}
            videoBrief={mkVideoBrief()}
            imageConcepts={[]}
            videoUrl={url}
          />,
        );

        const videos = container.querySelectorAll('video');
        expect(videos.length).toBeGreaterThan(0);

        const video = videos[0];
        expect(video.getAttribute('src')).toBe(url);
        expect(video.hasAttribute('controls')).toBe(true);

        unmount();
      }),
      { numRuns: 15 },
    );
  });
});

// ── Property 3: GIF rendering ───────────────────────────────────────

describe('Property 7c (PBT): GIF inline preview renders as animated img', () => {
  it('for any GIF asset with a renderable URL, OutputDashboard renders an img element', () => {
    /**
     * **Validates: Requirements 17.3**
     *
     * When gifAsset is provided with a real .gif URL (not a .json
     * metadata path), GifPreview must render an <img> element with
     * the correct src and alt text.
     */
    fc.assert(
      fc.property(gifAssetArb, (gifAsset) => {
        const { container, unmount } = render(
          <OutputDashboard
            copyPackage={mkCopy()}
            storyboard={mkStoryboard()}
            videoBrief={mkVideoBrief()}
            imageConcepts={[]}
            gifAsset={gifAsset}
          />,
        );

        const imgs = Array.from(container.querySelectorAll('img'));
        const gifImg = imgs.find((el) => el.getAttribute('src') === gifAsset.url);

        expect(gifImg).toBeDefined();
        expect(gifImg!.getAttribute('alt')).toContain('GIF');

        unmount();
      }),
      { numRuns: 15 },
    );
  });
});

// ── Property 4: Download URL correctness ────────────────────────────

describe('Property 7d (PBT): Media assets with downloadUrl have correct links', () => {
  it('for any media asset with a downloadUrl, the rendered media points to the correct URL', () => {
    /**
     * **Validates: Requirements 17.1, 17.2, 17.3**
     *
     * When media URLs are provided (imageUrls, videoUrl, gifAsset.url),
     * the rendered elements must reference those exact URLs — ensuring
     * that download/preview would target the real file.
     */
    fc.assert(
      fc.property(
        imageUrlArb,
        videoUrlArb,
        gifAssetArb,
        (imgUrl, vidUrl, gifAsset) => {
          const { container, unmount } = render(
            <OutputDashboard
              copyPackage={mkCopy()}
              storyboard={mkStoryboard()}
              videoBrief={mkVideoBrief()}
              imageConcepts={[]}
              imageUrls={[imgUrl]}
              videoUrl={vidUrl}
              gifAsset={gifAsset}
            />,
          );

          // Image URL present in an img src
          const imgSrcs = Array.from(container.querySelectorAll('img')).map(
            (el) => el.getAttribute('src'),
          );
          expect(imgSrcs).toContain(imgUrl);

          // Video URL present in a video src
          const videoSrcs = Array.from(container.querySelectorAll('video')).map(
            (el) => el.getAttribute('src'),
          );
          expect(videoSrcs).toContain(vidUrl);

          // GIF URL present in an img src
          expect(imgSrcs).toContain(gifAsset.url);

          unmount();
        },
      ),
      { numRuns: 10 },
    );
  });
});

// ── Property 5: Empty imageUrls → no images ────────────────────────

describe('Property 7e (PBT): Empty imageUrls produces no image elements in media section', () => {
  it('when imageUrls is empty, no img elements are rendered for images', () => {
    /**
     * **Validates: Requirements 17.1**
     *
     * When imageUrls is an empty array and no imageConcepts are
     * provided, the VisualDirection section should not render any
     * <img> elements for generated images.
     */
    fc.assert(
      fc.property(fc.constant(undefined), () => {
        const { container, unmount } = render(
          <OutputDashboard
            copyPackage={mkCopy()}
            storyboard={mkStoryboard()}
            videoBrief={mkVideoBrief()}
            imageConcepts={[]}
            imageUrls={[]}
          />,
        );

        // No img elements should be rendered for images
        // (there may be SVG icons but no <img> with a media src)
        const imgs = Array.from(container.querySelectorAll('img'));
        const mediaImgs = imgs.filter((el) => {
          const src = el.getAttribute('src') ?? '';
          return src.startsWith('http') || src.startsWith('blob:');
        });
        expect(mediaImgs.length).toBe(0);

        unmount();
      }),
      { numRuns: 5 },
    );
  });
});

// ── Property 6: Undefined videoUrl → no video element ───────────────

describe('Property 7f (PBT): Undefined videoUrl produces no video element', () => {
  it('when videoUrl is undefined, no video element is rendered', () => {
    /**
     * **Validates: Requirements 17.2**
     *
     * When videoUrl is not provided, VideoBriefView should not render
     * a <video> element — it should show a fallback message instead.
     */
    fc.assert(
      fc.property(fc.constant(undefined), () => {
        const { container, unmount } = render(
          <OutputDashboard
            copyPackage={mkCopy()}
            storyboard={mkStoryboard()}
            videoBrief={mkVideoBrief()}
            imageConcepts={[]}
            videoUrl={undefined}
          />,
        );

        const videos = container.querySelectorAll('video');
        expect(videos.length).toBe(0);

        unmount();
      }),
      { numRuns: 5 },
    );
  });
});
