"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutputPreference = exports.AssetType = exports.JobState = void 0;
var JobState;
(function (JobState) {
    JobState["Queued"] = "queued";
    JobState["ProcessingInput"] = "processing_input";
    JobState["GeneratingCopy"] = "generating_copy";
    JobState["GeneratingImages"] = "generating_images";
    JobState["GeneratingVideo"] = "generating_video";
    JobState["GeneratingGif"] = "generating_gif";
    JobState["ComposingPackage"] = "composing_package";
    JobState["Completed"] = "completed";
    JobState["Failed"] = "failed";
})(JobState || (exports.JobState = JobState = {}));
var AssetType;
(function (AssetType) {
    AssetType["Copy"] = "copy";
    AssetType["Image"] = "image";
    AssetType["Video"] = "video";
    AssetType["Storyboard"] = "storyboard";
    AssetType["VoiceoverScript"] = "voiceover_script";
    AssetType["Gif"] = "gif";
    AssetType["ImageConcept"] = "image_concept";
    AssetType["VideoBriefMeta"] = "video_brief_meta";
    AssetType["GifCreativeDirection"] = "gif_creative_direction";
})(AssetType || (exports.AssetType = AssetType = {}));
var OutputPreference;
(function (OutputPreference) {
    OutputPreference["Auto"] = "auto";
    OutputPreference["CopyOnly"] = "copy_only";
    OutputPreference["CopyImage"] = "copy_image";
    OutputPreference["CopyVideo"] = "copy_video";
    OutputPreference["FullPackage"] = "full_package";
    OutputPreference["CopyGif"] = "copy_gif";
})(OutputPreference || (exports.OutputPreference = OutputPreference = {}));
//# sourceMappingURL=job.js.map