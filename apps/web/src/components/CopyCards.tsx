import { useState, useCallback } from 'react';
import type { CopyPackage } from '@content-storyteller/shared';

export interface CopyCardsProps { copyPackage: Partial<CopyPackage>; }

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ok */ }
  }, [text]);
  return (
    <button onClick={handleCopy} aria-label={`Copy ${label}`} className="shrink-0 px-2.5 py-1 text-xs font-medium rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100 transition-colors">
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

function CopyCard({ title, content }: { title: string; content: string }) {
  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-label mb-2">{title}</h4>
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{content}</p>
        </div>
        <CopyButton text={content} label={title} />
      </div>
    </div>
  );
}

export function CopyCards({ copyPackage }: CopyCardsProps) {
  const { hook, caption, cta, hashtags } = copyPackage;
  return (
    <div className="space-y-3">
      <SectionHeader icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-600" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>} title="Copy Package" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {hook && <CopyCard title="Hook" content={hook} />}
        {caption && <CopyCard title="Caption" content={caption} />}
        {cta && <CopyCard title="Call to Action" content={cta} />}
      </div>
      {hashtags && hashtags.length > 0 && (
        <div className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="text-label mb-2">Hashtags</h4>
              <div className="flex flex-wrap gap-2">
                {hashtags.map((tag, i) => (
                  <span key={i} className="pill-brand">{tag.startsWith('#') ? tag : `#${tag}`}</span>
                ))}
              </div>
            </div>
            <CopyButton text={hashtags.join(' ')} label="Hashtags" />
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">{icon}</div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
    </div>
  );
}
