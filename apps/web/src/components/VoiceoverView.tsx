import { useState, useCallback } from 'react';

export interface VoiceoverViewProps { voiceoverScript?: string; onScreenText?: string[]; }

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

export function VoiceoverView({ voiceoverScript, onScreenText }: VoiceoverViewProps) {
  if (!voiceoverScript && (!onScreenText || onScreenText.length === 0)) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-600" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /></svg>
        </div>
        <h3 className="text-base font-semibold text-gray-900">Voiceover & On-Screen Text</h3>
      </div>
      {voiceoverScript && (
        <div className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="text-label mb-2">Voiceover Script</h4>
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{voiceoverScript}</p>
            </div>
            <CopyButton text={voiceoverScript} label="voiceover script" />
          </div>
        </div>
      )}
      {onScreenText && onScreenText.length > 0 && (
        <div className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="text-label mb-2">On-Screen Text</h4>
              <ol className="space-y-1.5">
                {onScreenText.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
                    <span className="shrink-0 w-5 h-5 rounded-lg bg-brand-100 text-brand-600 text-xs font-medium flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ol>
            </div>
            <CopyButton text={onScreenText.join('\n')} label="on-screen text" />
          </div>
        </div>
      )}
    </div>
  );
}
