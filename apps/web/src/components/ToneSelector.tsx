import { Tone } from '@content-storyteller/shared';

interface ToneOption {
  value: Tone;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const TONE_OPTIONS: ToneOption[] = [
  {
    value: Tone.Cinematic,
    label: 'Cinematic',
    description: 'Epic, visual storytelling',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>,
  },
  {
    value: Tone.Punchy,
    label: 'Punchy',
    description: 'Bold, high-energy hooks',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>,
  },
  {
    value: Tone.Sleek,
    label: 'Sleek',
    description: 'Minimal, refined aesthetic',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>,
  },
  {
    value: Tone.Professional,
    label: 'Professional',
    description: 'Polished, business-ready',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>,
  },
];

interface ToneSelectorProps {
  value: Tone;
  onChange: (tone: Tone) => void;
}

export function ToneSelector({ value, onChange }: ToneSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {TONE_OPTIONS.map((opt) => {
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
