import { OutputPreference } from '@content-storyteller/shared';

interface OutputPreferenceOption {
  value: OutputPreference;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const OUTPUT_PREFERENCE_OPTIONS: OutputPreferenceOption[] = [
  {
    value: OutputPreference.Auto,
    label: 'Auto-detect',
    description: 'Infer from your prompt',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>,
  },
  {
    value: OutputPreference.CopyOnly,
    label: 'Copy only',
    description: 'Text, captions & hashtags',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
  },
  {
    value: OutputPreference.CopyImage,
    label: 'Copy + Image',
    description: 'Text with visual assets',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>,
  },
  {
    value: OutputPreference.CopyVideo,
    label: 'Copy + Video',
    description: 'Text with video brief',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>,
  },
  {
    value: OutputPreference.CopyGif,
    label: 'Copy + GIF',
    description: 'Text with animated GIF explainer',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="2" /><path d="M2 7h20" /><path d="M2 12h20" /><path d="M2 17h20" /><path d="M7 2v20" /><circle cx="15" cy="14.5" r="3.5" /><polygon points="14 13 14 16 16.5 14.5 14 13" /></svg>,
  },
  {
    value: OutputPreference.FullPackage,
    label: 'Full Package',
    description: 'Everything: copy, images & video',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>,
  },
];

interface OutputPreferenceSelectorProps {
  value: OutputPreference;
  onChange: (preference: OutputPreference) => void;
}

export function OutputPreferenceSelector({ value, onChange }: OutputPreferenceSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {OUTPUT_PREFERENCE_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-3 rounded-xl border-2 px-3 py-3 text-left transition-all duration-150 ${
              selected
                ? 'border-brand-500 bg-brand-50 shadow-sm shadow-brand-500/10'
                : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selected ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-500'}`}>
              {opt.icon}
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-medium ${selected ? 'text-brand-700' : 'text-gray-900'}`}>{opt.label}</p>
              <p className="text-xs text-gray-500 leading-tight">{opt.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
