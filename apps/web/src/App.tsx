import React from 'react';
import { useJob } from './hooks/useJob';
import { useSSE } from './hooks/useSSE';
import { getAssets } from './api/client';
import { LandingPage } from './components/LandingPage';
import { GenerationTimeline } from './components/GenerationTimeline';
import { OutputDashboard } from './components/OutputDashboard';
import { ExportPanel } from './components/ExportPanel';
import { LiveAgentPanel } from './components/LiveAgentPanel';
import { TrendAnalyzerPage } from './components/TrendAnalyzerPage';
import type {
  StreamEventShape,
  CopyPackage,
  Storyboard,
  VideoBrief,
  ImageConcept,
  CreativeBrief,
  AssetReferenceWithUrl,
  GifAssetMetadata,
  JobWarning,
} from '@content-storyteller/shared';
import { JobState, AssetType, Platform, Tone, TrendPlatform } from '@content-storyteller/shared';
import type { ExtractedCreativeDirection, TrendItem } from '@content-storyteller/shared';

type AppView = 'landing' | 'generating' | 'results';
type AppMode = 'batch' | 'live' | 'trends';

/* ── Creative Brief Summary (inline component) ──────────────────── */

function CreativeBriefSummary({ brief }: { brief: CreativeBrief }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm animate-fadeIn">
      <h3 className="text-lg font-bold text-gray-900 mb-3">🎯 Creative Brief</h3>

      {/* Platform & Tone badges */}
      <div className="flex flex-wrap gap-2 mb-4">
        {brief.platform && (
          <span className="inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700">
            📱 {brief.platform.replace(/_/g, ' ')}
          </span>
        )}
        {brief.tone && (
          <span className="inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full bg-purple-50 text-purple-700">
            🎨 {brief.tone}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        {brief.campaignAngle && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Campaign Angle</p>
            <p className="text-gray-800 leading-relaxed">{brief.campaignAngle}</p>
          </div>
        )}
        {brief.pacing && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pacing</p>
            <p className="text-gray-800 leading-relaxed">{brief.pacing}</p>
          </div>
        )}
        {brief.visualStyle && (
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Visual Style</p>
            <p className="text-gray-800 leading-relaxed">{brief.visualStyle}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main App ────────────────────────────────────────────────────── */

export default function App() {
  const { phase, jobId, error, startJob, refreshJob, setPhase } = useJob();
  const [view, setView] = React.useState<AppView>('landing');
  const [mode, setMode] = React.useState<AppMode>('batch');

  // Partial result state from SSE events
  const [currentState, setCurrentState] = React.useState<JobState>(JobState.Queued);
  const [copyPackage, setCopyPackage] = React.useState<Partial<CopyPackage> | null>(null);
  const [storyboard, setStoryboard] = React.useState<Partial<Storyboard> | null>(null);
  const [videoBrief, setVideoBrief] = React.useState<Partial<VideoBrief> | null>(null);
  const [imageConcepts, setImageConcepts] = React.useState<ImageConcept[]>([]);
  const [creativeBrief, setCreativeBrief] = React.useState<CreativeBrief | null>(null);
  const [assets, setAssets] = React.useState<AssetReferenceWithUrl[]>([]);
  const [gifAsset, setGifAsset] = React.useState<GifAssetMetadata | null>(null);
  const [imageUrls, setImageUrls] = React.useState<string[]>([]);

  // SSE metadata state for output routing
  const [requestedOutputs, setRequestedOutputs] = React.useState<string[]>([]);
  const [skippedOutputs, setSkippedOutputs] = React.useState<string[]>([]);
  const [warnings, setWarnings] = React.useState<JobWarning[]>([]);

  // Pre-fill state from Trend Analyzer CTA
  const [trendPrompt, setTrendPrompt] = React.useState<string | undefined>(undefined);
  const [trendPlatform, setTrendPlatform] = React.useState<Platform | undefined>(undefined);

  // Derive video signed URL from completed video assets
  const videoUrl = React.useMemo(() => {
    const videoAsset = assets.find(
      (a) => a.assetType === AssetType.Video && a.status === 'completed' && a.signedUrl && a.storagePath?.includes('/video/'),
    );
    return videoAsset?.signedUrl;
  }, [assets]);

  // Derive view from job phase
  React.useEffect(() => {
    if (phase === 'idle' || phase === 'failed') {
      setView('landing');
    } else if (phase === 'uploading' || phase === 'creating' || phase === 'streaming') {
      setView('generating');
    } else if (phase === 'completed') {
      setView('results');
    }
  }, [phase]);

  // Reset partial state when starting a new job
  const resetPartialState = React.useCallback(() => {
    setCurrentState(JobState.Queued);
    setCopyPackage(null);
    setStoryboard(null);
    setVideoBrief(null);
    setImageConcepts([]);
    setCreativeBrief(null);
    setAssets([]);
    setGifAsset(null);
    setImageUrls([]);
    setRequestedOutputs([]);
    setSkippedOutputs([]);
    setWarnings([]);
  }, []);

  // Wrap startJob to reset state
  const handleStartJob = React.useCallback(
    async (files: File[], promptText: string, platform: Parameters<typeof startJob>[2], tone: Parameters<typeof startJob>[3], outputPreference?: Parameters<typeof startJob>[4]) => {
      resetPartialState();
      return startJob(files, promptText, platform, tone, outputPreference);
    },
    [startJob, resetPartialState],
  );

  // Map TrendPlatform to Platform enum
  const mapTrendPlatform = React.useCallback((tp: TrendPlatform): Platform => {
    switch (tp) {
      case TrendPlatform.InstagramReels: return Platform.InstagramReel;
      case TrendPlatform.XTwitter: return Platform.XTwitterThread;
      case TrendPlatform.LinkedIn: return Platform.LinkedInLaunchPost;
      case TrendPlatform.AllPlatforms: return Platform.GeneralPromoPackage;
      default: return Platform.GeneralPromoPackage;
    }
  }, []);

  // Handle "Use in Content Storyteller" from Trend Analyzer
  const handleUseTrend = React.useCallback((trend: TrendItem) => {
    const prompt = [
      `Trending Topic: ${trend.title}`,
      trend.description,
      '',
      `Hook: ${trend.suggestedHook}`,
      `Content Angle: ${trend.suggestedContentAngle}`,
      `Hashtags: ${trend.suggestedHashtags.join(', ')}`,
    ].join('\n');

    setTrendPrompt(prompt);
    setTrendPlatform(mapTrendPlatform(trend.platform));
    setMode('batch');
  }, [mapTrendPlatform]);

  // Handle creative direction from Live Agent Mode → switch to batch and auto-generate
  const handleUseCreativeDirection = React.useCallback(
    async (direction: ExtractedCreativeDirection) => {
      setMode('batch');
      resetPartialState();
      const platform = (direction.suggestedPlatform as Platform) || Platform.GeneralPromoPackage;
      const tone = (direction.suggestedTone as Tone) || Tone.Professional;
      try {
        await startJob([], direction.suggestedPrompt, platform, tone);
      } catch {
        // error is handled by useJob
      }
    },
    [startJob, resetPartialState],
  );

  // SSE callbacks
  const handleStateChange = React.useCallback((data: StreamEventShape['data']) => {
    if (data.state) {
      setCurrentState(data.state);
    }
    if (data.requestedOutputs) {
      setRequestedOutputs(data.requestedOutputs);
    }
    if (data.skippedOutputs) {
      setSkippedOutputs(data.skippedOutputs);
    }
    if (data.warnings) {
      setWarnings(data.warnings);
    }
    if (data.assets && Array.isArray(data.assets)) {
      const signedAssets = data.assets as AssetReferenceWithUrl[];
      const imgUrls = signedAssets.filter((a) => a.assetType === AssetType.Image && a.signedUrl).map((a) => a.signedUrl!);
      if (imgUrls.length > 0) setImageUrls(imgUrls);
      const gifRef = signedAssets.find((a) => a.assetType === AssetType.Gif && a.signedUrl);
      if (gifRef) setGifAsset({ url: gifRef.signedUrl!, mimeType: 'image/gif', width: 480, height: 480, durationMs: 3000, loop: true, fileSizeBytes: 0 });
    }
  }, []);

  const handlePartialResult = React.useCallback((data: StreamEventShape['data']) => {
    if (data.state) {
      setCurrentState(data.state);
    }
    if (data.partialCopy) {
      setCopyPackage(data.partialCopy);
    }
    if (data.partialStoryboard) {
      setStoryboard(data.partialStoryboard);
    }
    if (data.partialVideoBrief) {
      setVideoBrief(data.partialVideoBrief);
    }
    if (data.partialImageConcepts && data.partialImageConcepts.length > 0) {
      setImageConcepts(data.partialImageConcepts);
    }
    if (data.creativeBrief) {
      setCreativeBrief(data.creativeBrief);
    }
    if (data.partialGifAsset) {
      setGifAsset(data.partialGifAsset);
    }
  }, []);

  const handleComplete = React.useCallback(
    async (data: StreamEventShape['data']) => {
      if (data.state) setCurrentState(data.state);
      if (data.creativeBrief) setCreativeBrief(data.creativeBrief);
      if (data.requestedOutputs) setRequestedOutputs(data.requestedOutputs);
      if (data.skippedOutputs) setSkippedOutputs(data.skippedOutputs);
      if (data.warnings) setWarnings(data.warnings);
      setPhase('completed');
      refreshJob();

      // Fetch final assets with signed URLs
      if (jobId) {
        try {
          const response = await getAssets(jobId);
          if (response.bundle?.assets) {
            // Map assets to AssetReferenceWithUrl (the API returns them with signedUrl)
            const assetsWithUrls = response.bundle.assets.map((a) => ({
              ...a,
              signedUrl: (a as AssetReferenceWithUrl).signedUrl ?? '',
            }));
            setAssets(assetsWithUrls);
            const imgUrls = assetsWithUrls.filter((a) => a.assetType === AssetType.Image && a.signedUrl).map((a) => a.signedUrl);
            if (imgUrls.length > 0) setImageUrls(imgUrls);
            const gifRef = assetsWithUrls.find((a) => a.assetType === AssetType.Gif && a.signedUrl);
            if (gifRef) setGifAsset({ url: gifRef.signedUrl, mimeType: 'image/gif', width: 480, height: 480, durationMs: 3000, loop: true, fileSizeBytes: 0 });
          }
        } catch {
          // Assets fetch failed — user can still see partial results
        }
      }
    },
    [setPhase, refreshJob, jobId],
  );

  const handleFailed = React.useCallback(
    (_data: StreamEventShape['data']) => {
      setPhase('failed');
    },
    [setPhase],
  );

  useSSE({
    jobId,
    enabled: phase === 'streaming',
    callbacks: {
      onStateChange: handleStateChange,
      onPartialResult: handlePartialResult,
      onComplete: handleComplete,
      onFailed: handleFailed,
    },
  });

  const handleNewProject = React.useCallback(() => {
    resetPartialState();
    setPhase('idle');
    setView('landing');
    setMode('batch');
  }, [resetPartialState, setPhase]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1
            className="text-xl font-bold text-gray-900 cursor-pointer"
            onClick={() => {
              if (phase === 'idle' || phase === 'failed') setView('landing');
            }}
          >
            🎬 Content Storyteller
          </h1>
          {view !== 'landing' && (
            <button
              onClick={handleNewProject}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition"
            >
              ← New Project
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 section-wrapper py-8">
        {/* ── Landing View ──────────────────────────────────────── */}
        {view === 'landing' && (
          <>
            {/* Mode toggle */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                <button
                  onClick={() => setMode('batch')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    mode === 'batch'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  📦 Batch Mode
                </button>
                <button
                  onClick={() => setMode('live')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    mode === 'live'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  🎙️ Live Agent
                </button>
                <button
                  onClick={() => setMode('trends')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    mode === 'trends'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  📊 Trend Analyzer
                </button>
              </div>
            </div>

            {mode === 'batch' ? (
              <LandingPage
                onStartJob={handleStartJob}
                error={error}
                isSubmitting={phase === 'uploading' || phase === 'creating'}
                initialPrompt={trendPrompt}
                initialPlatform={trendPlatform}
              />
            ) : mode === 'live' ? (
              <LiveAgentPanel onUseCreativeDirection={handleUseCreativeDirection} />
            ) : (
              <TrendAnalyzerPage onUseTrend={handleUseTrend} />
            )}
          </>
        )}

        {/* ── Generating View ───────────────────────────────────── */}
        {view === 'generating' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Creative Brief summary */}
            {creativeBrief && <CreativeBriefSummary brief={creativeBrief} />}

            {/* Responsive 2-column layout: timeline left, dashboard right */}
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
              {/* Timeline */}
              <div className="lg:sticky lg:top-24 lg:self-start">
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                    Pipeline Progress
                  </h3>
                  <GenerationTimeline currentState={currentState} />
                </div>
              </div>

              {/* Output Dashboard with progressive reveal */}
              <div className="min-w-0">
                <OutputDashboard
                  copyPackage={copyPackage}
                  storyboard={storyboard}
                  videoBrief={videoBrief}
                  imageConcepts={imageConcepts}
                  videoUrl={videoUrl}
                  requestedOutputs={requestedOutputs}
                  skippedOutputs={skippedOutputs}
                  warnings={warnings}
                  gifAsset={gifAsset}
                  imageUrls={imageUrls}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Results View ──────────────────────────────────────── */}
        {view === 'results' && (
          <div className="space-y-8 animate-fadeIn">
            {/* Creative Brief summary */}
            {creativeBrief && <CreativeBriefSummary brief={creativeBrief} />}

            {/* Output Dashboard with all final data */}
            <OutputDashboard
              copyPackage={copyPackage}
              storyboard={storyboard}
              videoBrief={videoBrief}
              imageConcepts={imageConcepts}
              videoUrl={videoUrl}
                  requestedOutputs={requestedOutputs}
                  skippedOutputs={skippedOutputs}
                  warnings={warnings}
                  gifAsset={gifAsset}
                  imageUrls={imageUrls}
            />

            {/* Export Panel */}
            {jobId && (
              <ExportPanel jobId={jobId} assets={assets} />
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white/60 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-xs text-gray-400">
          Built with Gemini 2.0 Flash · Google Cloud · React
        </div>
      </footer>
    </div>
  );
}
