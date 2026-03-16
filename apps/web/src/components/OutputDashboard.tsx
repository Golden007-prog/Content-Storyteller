import type { CopyPackage, Storyboard, VideoBrief, ImageConcept, GifAssetMetadata, JobWarning } from '@content-storyteller/shared';
import { CopyCards } from './CopyCards';
import { GifPreview } from './GifPreview';
import { StoryboardView } from './StoryboardView';
import { VisualDirection } from './VisualDirection';
import { VideoBriefView } from './VideoBriefView';
import { VoiceoverView } from './VoiceoverView';

export interface OutputDashboardProps {
  copyPackage?: Partial<CopyPackage> | null;
  storyboard?: Partial<Storyboard> | null;
  videoBrief?: Partial<VideoBrief> | null;
  imageConcepts?: ImageConcept[] | null;
  gifAsset?: GifAssetMetadata | null;
  videoUrl?: string;
  imageUrls?: string[];
  skippedOutputs?: string[];
  requestedOutputs?: string[];
  warnings?: JobWarning[];
}

function SkeletonSection() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-5 w-40" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="skeleton h-32" />
        <div className="skeleton h-32" />
      </div>
    </div>
  );
}

function SkippedNote({ type }: { type: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-500">
      <span>ℹ️</span>
      <span>{type.charAt(0).toUpperCase() + type.slice(1)} generation was not requested for this package</span>
    </div>
  );
}

function SectionWrapper({ children, visible }: { children: React.ReactNode; visible: boolean }) {
  return (
    <div className={`transition-all duration-500 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      {children}
    </div>
  );
}

export function OutputDashboard({ copyPackage, storyboard, videoBrief, imageConcepts, gifAsset, videoUrl, imageUrls, skippedOutputs, requestedOutputs, warnings }: OutputDashboardProps) {
  const hasCopy = !!copyPackage;
  const hasStoryboard = !!storyboard;
  const hasVideoBrief = !!videoBrief;
  const hasImageConcepts = !!imageConcepts && imageConcepts.length > 0;
  const hasImages = !!imageUrls && imageUrls.length > 0;
  const hasGif = !!gifAsset;
  const hasAnyContent = hasCopy || hasStoryboard || hasVideoBrief || hasImageConcepts || hasImages || hasGif;

  // Derive video status from warnings
  const videoStatus: 'ok' | 'timeout' | 'failed' | 'pending' = (() => {
    if (videoUrl) return 'ok';
    const videoWarning = warnings?.find(w => w.stage === 'GenerateVideo');
    if (videoWarning?.message?.includes('video-generation-timeout')) return 'timeout';
    if (videoWarning) return 'failed';
    return 'pending';
  })();

  // Determine if an output type is skipped
  const isSkipped = (type: string) => skippedOutputs?.includes(type) ?? false;
  // Determine if an output type should be shown (either no filtering or it's requested and not skipped)
  const shouldShow = (type: string) => {
    if (!requestedOutputs && !skippedOutputs) return true; // backward compat
    if (isSkipped(type)) return false;
    if (requestedOutputs) return requestedOutputs.includes(type);
    return true;
  };

  const showImage = shouldShow('image');
  const showVideo = shouldShow('video') && shouldShow('storyboard');
  const showGif = shouldShow('gif');

  if (!hasAnyContent) {
    return (
      <div className="space-y-6">
        <SkeletonSection />
        {showImage ? <SkeletonSection /> : isSkipped('image') && <SkippedNote type="image" />}
        {showVideo ? <SkeletonSection /> : (isSkipped('video') || isSkipped('storyboard')) && <SkippedNote type="video" />}
        {showGif ? <SkeletonSection /> : isSkipped('gif') && <SkippedNote type="gif" />}
        {showImage ? <SkeletonSection /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {hasCopy ? <SectionWrapper visible><CopyCards copyPackage={copyPackage} /></SectionWrapper> : <SkeletonSection />}
      {hasCopy && (copyPackage.voiceoverScript || copyPackage.onScreenText) && (
        <SectionWrapper visible><VoiceoverView voiceoverScript={copyPackage.voiceoverScript} onScreenText={copyPackage.onScreenText} /></SectionWrapper>
      )}
      {showVideo && (hasStoryboard ? <SectionWrapper visible><StoryboardView storyboard={storyboard} /></SectionWrapper> : hasCopy && <SkeletonSection />)}
      {showImage && ((hasImageConcepts || hasImages) ? <SectionWrapper visible><VisualDirection imageConcepts={imageConcepts ?? []} imageUrls={imageUrls} /></SectionWrapper> : hasCopy && <SkeletonSection />)}
      {showVideo && (hasVideoBrief ? <SectionWrapper visible><VideoBriefView videoBrief={videoBrief} videoUrl={videoUrl} videoStatus={videoStatus} /></SectionWrapper> : hasStoryboard && <SkeletonSection />)}
      {showGif && (hasGif ? <SectionWrapper visible><GifPreview gifAsset={gifAsset} /></SectionWrapper> : hasCopy && <SkeletonSection />)}
    </div>
  );
}
