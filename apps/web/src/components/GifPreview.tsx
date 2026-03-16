import type { GifAssetMetadata } from '@content-storyteller/shared';

export interface GifCopyData {
  hook?: string;
  caption?: string;
  hashtags?: string[];
  cta?: string;
}

export interface GifPreviewProps {
  gifAsset: GifAssetMetadata;
  copyData?: GifCopyData;
}

/**
 * Returns true if the gifAsset.url is not a renderable GIF —
 * either falsy, pointing to a .json file, or containing metadata path markers.
 */
function isNonRenderableUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return lower.endsWith('.json') || lower.includes('creative-direction') || lower.includes('gif_creative_direction');
}

export function GifPreview({ gifAsset, copyData }: GifPreviewProps) {
  const { hook, caption, hashtags, cta } = copyData ?? {};
  const showFallback = isNonRenderableUrl(gifAsset.url);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-600" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="2" y1="7" x2="7" y2="7" />
            <line x1="2" y1="17" x2="7" y2="17" />
            <line x1="17" y1="7" x2="22" y2="7" />
            <line x1="17" y1="17" x2="22" y2="17" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-900">GIF Preview</h3>
      </div>

      <div className="card p-5">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="shrink-0">
            {showFallback ? (
              <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 text-sm p-6 max-w-full md:max-w-xs" style={{ width: gifAsset.width || 320, height: gifAsset.height || 240 }}>
                GIF preview unavailable — only creative direction metadata was generated.
              </div>
            ) : (
              <img
                src={gifAsset.url}
                alt="Generated GIF preview"
                width={gifAsset.width}
                height={gifAsset.height}
                className="rounded-lg border border-gray-200 max-w-full md:max-w-xs"
              />
            )}
          </div>

          {(hook || caption || cta || (hashtags && hashtags.length > 0)) && (
            <div className="flex-1 space-y-4 min-w-0">
              {hook && (
                <div>
                  <h4 className="text-label mb-1">Hook</h4>
                  <p className="text-sm text-gray-800 leading-relaxed">{hook}</p>
                </div>
              )}
              {caption && (
                <div>
                  <h4 className="text-label mb-1">Caption</h4>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{caption}</p>
                </div>
              )}
              {cta && (
                <div>
                  <h4 className="text-label mb-1">Call to Action</h4>
                  <p className="text-sm text-gray-800 leading-relaxed">{cta}</p>
                </div>
              )}
              {hashtags && hashtags.length > 0 && (
                <div>
                  <h4 className="text-label mb-1">Hashtags</h4>
                  <div className="flex flex-wrap gap-2">
                    {hashtags.map((tag, i) => (
                      <span key={i} className="pill-brand">{tag.startsWith('#') ? tag : `#${tag}`}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
