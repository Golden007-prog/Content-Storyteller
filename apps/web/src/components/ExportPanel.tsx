import { useState, useCallback } from 'react';
import type { AssetReferenceWithUrl } from '@content-storyteller/shared';

const API_URL = import.meta.env.VITE_API_URL || '';

async function downloadManifestJson(url: string, jobId: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bundle request failed: ${res.status}`);
  const manifest = await res.json();
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${jobId}-manifest.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export interface ExportPanelProps { jobId: string; assets: AssetReferenceWithUrl[]; }

function assetLabel(asset: AssetReferenceWithUrl): string {
  const labels: Record<string, string> = { copy: 'Copy Package', image: 'Image', video: 'Video', gif: 'GIF', storyboard: 'Storyboard', voiceover_script: 'Voiceover Script' };
  return labels[asset.assetType] ?? asset.assetType;
}

function isTextAsset(asset: AssetReferenceWithUrl): boolean {
  return asset.assetType === 'copy' || asset.assetType === 'storyboard' || asset.assetType === 'voiceover_script' || (asset.storagePath?.endsWith('.json') ?? false);
}

function CopyToClipboardButton({ url }: { url: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'copied' | 'error'>('idle');
  const handleCopy = useCallback(async () => {
    if (!url) return;
    setState('loading');
    try { const res = await fetch(url); if (!res.ok) throw new Error('fetch failed'); await navigator.clipboard.writeText(await res.text()); setState('copied'); setTimeout(() => setState('idle'), 1500); }
    catch { setState('error'); setTimeout(() => setState('idle'), 2000); }
  }, [url]);
  if (!url) return null;
  const label = state === 'loading' ? 'Loading…' : state === 'copied' ? '✓ Copied' : state === 'error' ? 'Failed' : 'Copy';
  return (
    <button onClick={handleCopy} disabled={state === 'loading'} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100 disabled:opacity-50 transition-colors">
      {label}
    </button>
  );
}

function AssetRow({ asset }: { asset: AssetReferenceWithUrl }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 card hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-500" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{assetLabel(asset)}</p>
          <p className="text-xs text-gray-400 truncate">{asset.assetId}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {asset.signedUrl ? (
          <>
            {isTextAsset(asset) && <CopyToClipboardButton url={asset.signedUrl} />}
            <a href={asset.signedUrl} download className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">Download</a>
          </>
        ) : (
          <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-50 text-gray-400 cursor-not-allowed">Unavailable</span>
        )}
      </div>
    </div>
  );
}

export function ExportPanel({ jobId, assets }: ExportPanelProps) {
  const bundleUrl = `${API_URL}/api/v1/jobs/${encodeURIComponent(jobId)}/bundle`;
  const zipUrl = `${bundleUrl}?format=zip`;
  const [downloading, setDownloading] = useState(false);

  const handleDownloadAll = useCallback(async () => {
    setDownloading(true);
    try {
      const zipRes = await fetch(zipUrl);
      if (zipRes.ok && zipRes.headers.get('content-type')?.includes('application/zip')) {
        const blob = await zipRes.blob();
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${jobId}-assets.zip`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
      } else { await downloadManifestJson(bundleUrl, jobId); }
    } catch { try { await downloadManifestJson(bundleUrl, jobId); } catch { /* ok */ } }
    finally { setDownloading(false); }
  }, [bundleUrl, zipUrl, jobId]);

  if (assets.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
        </div>
        <p className="text-sm text-gray-400">No assets available for download yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-600" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900">Export Assets</h3>
        </div>
        <button onClick={handleDownloadAll} disabled={downloading} className="btn-primary !py-2 !px-4 !text-sm">
          {downloading ? 'Downloading…' : 'Download All'}
        </button>
      </div>
      <div className="space-y-2">
        {assets.map((asset) => <AssetRow key={asset.assetId} asset={asset} />)}
      </div>
    </div>
  );
}
