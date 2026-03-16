import { Platform, Tone, OutputPreference, OutputIntent } from '@content-storyteller/shared';

export interface PlannerInput {
  promptText: string;
  platform: Platform;
  tone: Tone;
  uploadedMediaPaths: string[];
  outputPreference?: OutputPreference;
  trendContext?: { desiredOutputType?: string };
}

function createBaseIntent(): OutputIntent {
  return {
    wantsCopy: true,
    wantsHashtags: false,
    wantsImage: false,
    wantsVideo: false,
    wantsStoryboard: false,
    wantsVoiceover: false,
    wantsCarousel: false,
    wantsThread: false,
    wantsLinkedInPost: false,
    wantsGif: false,
  };
}

export function resolveOutputIntent(input: PlannerInput): OutputIntent {
  const intent = createBaseIntent();

  // (b) Explicit outputPreference mapping (not auto and not undefined)
  if (input.outputPreference && input.outputPreference !== OutputPreference.Auto) {
    switch (input.outputPreference) {
      case OutputPreference.CopyOnly:
        intent.wantsImage = false;
        intent.wantsVideo = false;
        break;
      case OutputPreference.CopyImage:
        intent.wantsImage = true;
        intent.wantsVideo = false;
        break;
      case OutputPreference.CopyVideo:
        intent.wantsVideo = true;
        intent.wantsImage = false;
        intent.wantsStoryboard = true;
        intent.wantsVoiceover = true;
        break;
      case OutputPreference.CopyGif:
        intent.wantsGif = true;
        intent.wantsVideo = false;
        intent.wantsImage = false;
        break;
      case OutputPreference.FullPackage:
        intent.wantsImage = true;
        intent.wantsVideo = true;
        intent.wantsStoryboard = true;
        intent.wantsVoiceover = true;
        intent.wantsGif = true;
        break;
    }
    intent.wantsHashtags = true;
    intent.wantsLinkedInPost = input.platform === Platform.LinkedInLaunchPost;
    intent.wantsCopy = true;
    return intent;
  }

  // (c) Trend context override
  if (input.trendContext?.desiredOutputType) {
    const outputType = input.trendContext.desiredOutputType.toLowerCase();
    if (outputType === 'video' || outputType === 'reel') {
      intent.wantsVideo = true;
      intent.wantsStoryboard = true;
      intent.wantsVoiceover = true;
    } else if (outputType === 'image') {
      intent.wantsImage = true;
    } else if (outputType === 'copy' || outputType === 'text') {
      // copy-only: wantsImage and wantsVideo stay false
    } else if (outputType === 'full' || outputType === 'package') {
      intent.wantsImage = true;
      intent.wantsVideo = true;
      intent.wantsStoryboard = true;
      intent.wantsVoiceover = true;
    }
    intent.wantsHashtags = true;
    intent.wantsLinkedInPost = input.platform === Platform.LinkedInLaunchPost;
    intent.wantsThread = input.platform === Platform.XTwitterThread;
    intent.wantsCopy = true;
    return intent;
  }

  // (d) Platform defaults
  switch (input.platform) {
    case Platform.InstagramReel:
      intent.wantsVideo = true;
      intent.wantsImage = true;
      intent.wantsStoryboard = true;
      intent.wantsVoiceover = true;
      break;
    case Platform.LinkedInLaunchPost:
      intent.wantsLinkedInPost = true;
      intent.wantsHashtags = true;
      break;
    case Platform.XTwitterThread:
      intent.wantsThread = true;
      intent.wantsHashtags = true;
      break;
    case Platform.GeneralPromoPackage:
      intent.wantsImage = true;
      intent.wantsVideo = true;
      intent.wantsStoryboard = true;
      intent.wantsVoiceover = true;
      intent.wantsHashtags = true;
      break;
  }

  // (e) Prompt keyword scanning (case-insensitive)
  const prompt = input.promptText.toLowerCase();

  // Video keywords
  if (/\b(video|reel|teaser|promo clip|short video|cinematic video|video ad|video clip)\b/i.test(prompt)) {
    intent.wantsVideo = true;
    intent.wantsStoryboard = true;
    intent.wantsVoiceover = true;
  }

  // Image keywords
  if (/\b(image|photo|picture|visual|hero image|create an image|generate a visual|make a graphic|create a post image|include a visual|design a visual)\b/i.test(prompt)) {
    intent.wantsImage = true;
  }

  // Copy-only keywords (override image/video back to false)
  if (/\b(copy only|text only)\b/.test(prompt)) {
    intent.wantsImage = false;
    intent.wantsVideo = false;
  }

  // Full package keywords
  if (/\b(complete package|full package)\b/.test(prompt)) {
    intent.wantsImage = true;
    intent.wantsVideo = true;
    intent.wantsStoryboard = true;
    intent.wantsVoiceover = true;
  }

  // GIF keywords
  if (/\b(gif|looping animation|animated explainer|linkedin gif|motion graphic|animated workflow|animate this|create a gif|make a gif|animated gif)\b/i.test(prompt)) {
    intent.wantsGif = true;
  }

  // Carousel keywords
  if (/\bcarousel\b/.test(prompt)) {
    intent.wantsCarousel = true;
    intent.wantsImage = true;
  }

  // (f) wantsCopy is ALWAYS true (invariant)
  intent.wantsCopy = true;

  return intent;
}
