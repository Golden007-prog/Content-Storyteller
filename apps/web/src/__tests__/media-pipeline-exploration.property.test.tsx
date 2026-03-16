import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { render } from '@testing-library/react';
import { OutputDashboard } from '../components/OutputDashboard';
import { extractMediaUrlsFromAssets } from '../hooks/useSSE';
import type { CopyPackage, Storyboard, VideoBrief } from '@content-storyteller/shared';

function mkCopy(): Partial<CopyPackage> {
  return { hook: 'H', caption: 'B', hashtags: ['#t'], cta: 'CTA' };
}

function mkSb(): Partial<Storyboard> {
  return {
    scenes: [{ sceneNumber: 1, description: 'O', duration: '5s', motionStyle: 's', textOverlay: 'W', cameraDirection: 'w' }],
    totalDuration: '15s',
    pacing: 'b',
  };
}

function mkVb(): Partial<VideoBrief> {
  return { totalDuration: '15s', motionStyle: 's', textOverlayStyle: 'b', cameraDirection: 'm', energyDirection: 'e' };
}

const signedUrlArb = fc.tuple(
  fc.constantFrom('https://storage.googleapis.com', 'https://cdn.example.com'),
  fc.hexaString({ minLength: 8, maxLength: 16 }),
  fc.constantFrom('.png', '.jpg', '.mp4', '.gif'),
).map(([base, id, ext]) => base + '/assets/' + id + ext);

/**
 * Defect 7 (PBT): OutputDashboard renders media from SSE asset references
 * **Validates: Requirements 1.7**
 */
describe('Defect 7 (PBT): OutputDashboard renders media from SSE asset references', () => {
  it('extracts and renders media from SSE asset references', () => {
    fc.assert(
      fc.property(signedUrlArb, signedUrlArb, (imgUrl, vidUrl) => {
        const sseAssets = [
          { assetType: 'image', signedUrl: imgUrl },
          { assetType: 'video', signedUrl: vidUrl },
        ];
        const { imageUrls, videoUrl } = extractMediaUrlsFromAssets(sseAssets);
        expect(imageUrls).toContain(imgUrl);
        expect(videoUrl).toBe(vidUrl);

        const { container, unmount } = render(
          <OutputDashboard
            copyPackage={mkCopy()}
            storyboard={mkSb()}
            videoBrief={mkVb()}
            imageConcepts={[]}
            imageUrls={imageUrls}
            videoUrl={videoUrl}
          />,
        );
        const imgSrcs = Array.from(container.querySelectorAll('img')).map(
          (i) => i.getAttribute('src'),
        );
        expect(imgSrcs).toContain(imgUrl);
        const vids = container.querySelectorAll('video');
        expect(vids.length).toBeGreaterThan(0);
        unmount();
      }),
      { numRuns: 10 },
    );
  });
});
