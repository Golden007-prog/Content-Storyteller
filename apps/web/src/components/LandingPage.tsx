import React, { useState, useEffect } from 'react';
import { Platform, Tone, OutputPreference } from '@content-storyteller/shared';
import type { UseJobReturn } from '../hooks/useJob';
import { PlatformSelector } from './PlatformSelector';
import { ToneSelector } from './ToneSelector';
import { OutputPreferenceSelector } from './OutputPreferenceSelector';
import { UploadForm } from './UploadForm';
import { HeroSection } from './layout/HeroSection';

interface LandingPageProps {
  onStartJob: (files: File[], promptText: string, platform: Platform, tone: Tone, outputPreference?: OutputPreference) => Promise<string>;
  error: string | null;
  isSubmitting: boolean;
  initialPrompt?: string;
  initialPlatform?: Platform;
}

export function LandingPage({ onStartJob, error, isSubmitting, initialPrompt, initialPlatform }: LandingPageProps) {
  const [promptText, setPromptText] = useState(initialPrompt ?? '');
  const [platform, setPlatform] = useState<Platform>(initialPlatform ?? Platform.InstagramReel);
  const [tone, setTone] = useState<Tone>(Tone.Cinematic);
  const [outputPreference, setOutputPreference] = useState<OutputPreference>(OutputPreference.Auto);
  const [files, setFiles] = useState<File[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => { if (initialPrompt !== undefined) setPromptText(initialPrompt); }, [initialPrompt]);
  useEffect(() => { if (initialPlatform !== undefined) setPlatform(initialPlatform); }, [initialPlatform]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (!promptText.trim()) { setValidationError('Please enter a text prompt describing your content.'); return; }
    try {
      await onStartJob(files, promptText, platform, tone, outputPreference);
    } catch {
      // Error is already captured by useJob and displayed via the error prop
    }
  };

  return (
    <div>
      {/* Hero */}
      <div className="section-lavender">
        <div className="section-wrapper">
          <HeroSection
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>}
            badge="Beta"
            title="Batch Mode Creator"
            subtitle="Upload your assets and generate complete marketing packages in minutes"
          />
        </div>
      </div>

      {/* Main content */}
      <div className="section-wrapper py-10">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 items-start">
            {/* Left column — Upload + Config */}
            <div className="space-y-6">
              {/* Step 1: Upload */}
              <StepSection number={1} title="Upload Assets" description="Add images, videos, or audio to include in your package">
                <UploadForm files={files} onFilesChange={setFiles} />
              </StepSection>

              {/* Step 2: Describe */}
              <StepSection number={2} title="Describe Your Content" description="Tell us what you're promoting or creating">
                <textarea
                  id="prompt"
                  aria-label="What are you promoting?"
                  rows={3}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="Describe your product, campaign, or idea..."
                  className="input-base resize-none"
                />
                {validationError && <p className="mt-2 text-sm text-red-600">{validationError}</p>}
              </StepSection>

              {/* Step 3: Configure */}
              <StepSection number={3} title="Configure Output" description="Choose platform and tone for your content">
                <div className="space-y-4">
                  <ConfigAccordion
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>}
                    title="Platform"
                    subtitle={platformLabel(platform)}
                    defaultOpen
                  >
                    <PlatformSelector value={platform} onChange={setPlatform} />
                  </ConfigAccordion>
                  <ConfigAccordion
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>}
                    title="Tone"
                    subtitle={toneLabel(tone)}
                  >
                    <ToneSelector value={tone} onChange={setTone} />
                  </ConfigAccordion>
                  <ConfigAccordion
                    icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg>}
                    title="Output Type"
                    subtitle={outputPreferenceLabel(outputPreference)}
                  >
                    <OutputPreferenceSelector value={outputPreference} onChange={setOutputPreference} />
                  </ConfigAccordion>
                </div>
              </StepSection>
            </div>

            {/* Right column — Preview + CTA */}
            <div className="lg:sticky lg:top-6 space-y-5">
              {/* Preview card */}
              <div className="card-elevated overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-brand-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Package Preview</h3>
                </div>
                <div className="p-5">
                  {/* Media preview */}
                  <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 mb-4 min-h-[140px]">
                    {files.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2">
                        {files.slice(0, 6).map((f, i) => (
                          <div key={`${f.name}-${i}`} className="aspect-square rounded-lg bg-gray-200 flex items-center justify-center text-xs text-gray-500 overflow-hidden">
                            {f.type.startsWith('image/') ? (
                              <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-center px-1 truncate">{f.name.split('.').pop()?.toUpperCase()}</span>
                            )}
                          </div>
                        ))}
                        {files.length > 6 && (
                          <div className="aspect-square rounded-lg bg-brand-50 flex items-center justify-center text-xs font-semibold text-brand-600">
                            +{files.length - 6}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-gray-300 py-8">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                        <p className="text-sm mt-3 text-gray-400">Upload assets to preview</p>
                      </div>
                    )}
                  </div>

                  {/* Prompt preview */}
                  {promptText.trim() ? (
                    <div className="mb-4">
                      <p className="text-label mb-1.5">Prompt</p>
                      <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">{promptText}</p>
                    </div>
                  ) : (
                    <div className="mb-4">
                      <p className="text-sm text-gray-400 italic">Enter a prompt to see preview...</p>
                    </div>
                  )}

                  {/* Config summary pills */}
                  <div className="flex flex-wrap gap-2">
                    <span className="pill-brand">{platformLabel(platform)}</span>
                    <span className="pill-neutral">{toneLabel(tone)}</span>
                    <span className="pill-neutral">{outputPreferenceLabel(outputPreference)}</span>
                    {files.length > 0 && (
                      <span className="pill-neutral">{files.length} file{files.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Generate CTA */}
              <button type="submit" disabled={isSubmitting} className="btn-primary w-full !py-4 !text-base">
                {isSubmitting ? (
                  <><span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</>
                ) : (
                  <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg> Generate Package</>
                )}
              </button>
              <p className="text-center text-xs text-gray-400">Typically takes 2–3 minutes</p>

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500 shrink-0 mt-0.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>
        </form>
      </div>

      {/* What You'll Get */}
      <WhatYoullGet />

      {/* Three Powerful Modes */}
      <ThreePowerfulModes />

      {/* Process Steps */}
      <ProcessSteps />

      {/* Stats */}
      <StatsSection />

      {/* Testimonials */}
      <TestimonialsSection />
    </div>
  );
}

/* ── Helper: platform / tone labels ───────────────────────────── */
const PLATFORM_LABELS: Record<string, string> = {
  [Platform.InstagramReel]: 'Instagram Reel',
  [Platform.LinkedInLaunchPost]: 'LinkedIn Post',
  [Platform.XTwitterThread]: 'X / Twitter',
  [Platform.GeneralPromoPackage]: 'General Promo',
};
function platformLabel(p: Platform): string { return PLATFORM_LABELS[p] ?? p; }

const TONE_LABELS: Record<string, string> = {
  [Tone.Cinematic]: 'Cinematic',
  [Tone.Punchy]: 'Punchy',
  [Tone.Sleek]: 'Sleek',
  [Tone.Professional]: 'Professional',
};
function toneLabel(t: Tone): string { return TONE_LABELS[t] ?? t; }

const OUTPUT_PREFERENCE_LABELS: Record<string, string> = {
  [OutputPreference.Auto]: 'Auto-detect',
  [OutputPreference.CopyOnly]: 'Copy only',
  [OutputPreference.CopyImage]: 'Copy + Image',
  [OutputPreference.CopyVideo]: 'Copy + Video',
  [OutputPreference.FullPackage]: 'Full Package',
  [OutputPreference.CopyGif]: 'Copy + GIF',
};
function outputPreferenceLabel(p: OutputPreference): string { return OUTPUT_PREFERENCE_LABELS[p] ?? p; }

/* ── Step Section ─────────────────────────────────────────────── */
function StepSection({ number, title, description, children }: {
  number: number; title: string; description: string; children: React.ReactNode;
}) {
  return (
    <div className="animate-fadeIn" style={{ animationDelay: `${(number - 1) * 80}ms` }}>
      <div className="flex items-center gap-3 mb-3">
        <span className="w-7 h-7 rounded-lg bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">{number}</span>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/* ── Config Accordion ─────────────────────────────────────────── */
function ConfigAccordion({ icon, title, subtitle, children, defaultOpen = false }: {
  icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0 text-brand-500">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-gray-100">{children}</div>}
    </div>
  );
}

/* ── What You'll Get ──────────────────────────────────────────── */
const DELIVERABLES = [
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
    title: 'Social Media Copy',
    desc: 'Platform-optimized captions, hooks, CTAs, and hashtags',
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>,
    title: 'Visual Storyboards',
    desc: 'Scene-by-scene layouts with motion and camera direction',
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>,
    title: 'Ready-to-Publish Assets',
    desc: 'Download images, video briefs, and full content packages',
  },
];

function WhatYoullGet() {
  return (
    <div className="section-lavender py-16">
      <div className="section-wrapper text-center">
        <h2 className="text-heading mb-3">What You'll Get</h2>
        <p className="text-subheading mb-12 max-w-xl mx-auto">Every package includes everything you need to launch your campaign</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {DELIVERABLES.map((item) => (
            <div key={item.title} className="card p-6 text-center group">
              <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4 text-brand-500 group-hover:bg-brand-100 transition-colors">
                {item.icon}
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1.5">{item.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Three Powerful Modes ─────────────────────────────────────── */
const MODES_CARDS = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    title: 'Batch Mode',
    description: 'Upload assets and generate complete marketing packages with AI-powered copy, storyboards, and video briefs in minutes.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: 'Live Agent',
    description: 'Brainstorm with an AI Creative Director in real-time. Get instant feedback, creative direction, and campaign ideas through conversation.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: 'Trend Analyzer',
    description: 'Discover trending topics across platforms with AI-powered insights, momentum scoring, and one-click content generation.',
  },
];

function ThreePowerfulModes() {
  return (
    <div className="py-16">
      <div className="section-wrapper text-center">
        <h2 className="text-heading mb-3">Three Powerful Modes</h2>
        <p className="text-subheading mb-12 max-w-xl mx-auto">Choose the workflow that fits your creative process</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {MODES_CARDS.map((item) => (
            <div key={item.title} className="rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 bg-white p-6 text-center group">
              <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4 text-brand-500 group-hover:bg-brand-100 transition-colors">
                {item.icon}
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1.5">{item.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Process Steps ────────────────────────────────────────────── */
const PROCESS_STEPS = [
  { number: 1, title: 'Upload', description: 'Add your images, videos, or audio assets to get started.' },
  { number: 2, title: 'Configure', description: 'Choose your platform, tone, and creative direction.' },
  { number: 3, title: 'Generate', description: 'AI creates copy, storyboards, video briefs, and more.' },
  { number: 4, title: 'Export', description: 'Download your complete content package ready to publish.' },
];

function ProcessSteps() {
  return (
    <div className="py-16">
      <div className="section-wrapper text-center">
        <h2 className="text-heading mb-3">How It Works</h2>
        <p className="text-subheading mb-12 max-w-xl mx-auto">From upload to publish in four simple steps</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {PROCESS_STEPS.map((step) => (
            <div key={step.number} className="flex flex-col items-center">
              <span className="w-10 h-10 rounded-full bg-gradient-brand text-white text-sm font-bold flex items-center justify-center mb-4">
                {step.number}
              </span>
              <h3 className="text-base font-semibold text-gray-900 mb-1.5">{step.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Stats Section ────────────────────────────────────────────── */
const STATS = [
  { value: '10K+', label: 'Creators' },
  { value: '500K+', label: 'Campaigns' },
  { value: '98%', label: 'Satisfaction' },
];

function StatsSection() {
  return (
    <div className="section-lavender py-16">
      <div className="section-wrapper text-center">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <p className="text-4xl sm:text-5xl font-extrabold bg-gradient-brand bg-clip-text text-transparent mb-2">
                {stat.value}
              </p>
              <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Testimonials Section ─────────────────────────────────────── */
const TESTIMONIALS = [
  {
    quote: 'Content Storyteller cut our campaign production time by 80%. The AI-generated storyboards are incredibly detailed.',
    name: 'Sarah Chen',
    role: 'Marketing Director, Lumina Studios',
  },
  {
    quote: 'The Live Agent mode is like having a creative director on call 24/7. It completely changed how we brainstorm.',
    name: 'Marcus Rivera',
    role: 'Head of Content, NovaBrand',
  },
  {
    quote: 'Trend Analyzer helped us catch a viral moment early. Our engagement tripled on the campaign we built from its insights.',
    name: 'Aisha Patel',
    role: 'Social Media Lead, Crescendo Media',
  },
];

function TestimonialsSection() {
  return (
    <div className="py-16">
      <div className="section-wrapper text-center">
        <h2 className="text-heading mb-3">What Creators Say</h2>
        <p className="text-subheading mb-12 max-w-xl mx-auto">Trusted by content teams around the world</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 bg-white p-6 text-left">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-brand-300 mb-4">
                <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" fill="currentColor" />
                <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" fill="currentColor" />
              </svg>
              <p className="text-sm text-gray-700 leading-relaxed mb-4">{t.quote}</p>
              <p className="text-sm font-semibold text-gray-900">{t.name}</p>
              <p className="text-xs text-gray-500">{t.role}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
