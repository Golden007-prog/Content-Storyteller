"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveOutputIntent = resolveOutputIntent;
const shared_1 = require("@content-storyteller/shared");
function createBaseIntent() {
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
function resolveOutputIntent(input) {
    const intent = createBaseIntent();
    // (b) Explicit outputPreference mapping (not auto and not undefined)
    if (input.outputPreference && input.outputPreference !== shared_1.OutputPreference.Auto) {
        switch (input.outputPreference) {
            case shared_1.OutputPreference.CopyOnly:
                intent.wantsImage = false;
                intent.wantsVideo = false;
                break;
            case shared_1.OutputPreference.CopyImage:
                intent.wantsImage = true;
                intent.wantsVideo = false;
                break;
            case shared_1.OutputPreference.CopyVideo:
                intent.wantsVideo = true;
                intent.wantsImage = false;
                intent.wantsStoryboard = true;
                intent.wantsVoiceover = true;
                break;
            case shared_1.OutputPreference.CopyGif:
                intent.wantsGif = true;
                intent.wantsVideo = false;
                intent.wantsImage = false;
                break;
            case shared_1.OutputPreference.FullPackage:
                intent.wantsImage = true;
                intent.wantsVideo = true;
                intent.wantsStoryboard = true;
                intent.wantsVoiceover = true;
                break;
        }
        intent.wantsHashtags = true;
        intent.wantsLinkedInPost = input.platform === shared_1.Platform.LinkedInLaunchPost;
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
        }
        else if (outputType === 'image') {
            intent.wantsImage = true;
        }
        else if (outputType === 'copy' || outputType === 'text') {
            // copy-only: wantsImage and wantsVideo stay false
        }
        else if (outputType === 'full' || outputType === 'package') {
            intent.wantsImage = true;
            intent.wantsVideo = true;
            intent.wantsStoryboard = true;
            intent.wantsVoiceover = true;
        }
        intent.wantsHashtags = true;
        intent.wantsLinkedInPost = input.platform === shared_1.Platform.LinkedInLaunchPost;
        intent.wantsThread = input.platform === shared_1.Platform.XTwitterThread;
        intent.wantsCopy = true;
        return intent;
    }
    // (d) Platform defaults
    switch (input.platform) {
        case shared_1.Platform.InstagramReel:
            intent.wantsVideo = true;
            intent.wantsImage = true;
            intent.wantsStoryboard = true;
            intent.wantsVoiceover = true;
            break;
        case shared_1.Platform.LinkedInLaunchPost:
            intent.wantsLinkedInPost = true;
            intent.wantsHashtags = true;
            break;
        case shared_1.Platform.XTwitterThread:
            intent.wantsThread = true;
            intent.wantsHashtags = true;
            break;
        case shared_1.Platform.GeneralPromoPackage:
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
//# sourceMappingURL=output-intent.js.map