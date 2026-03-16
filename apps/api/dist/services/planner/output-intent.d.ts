import { Platform, Tone, OutputPreference, OutputIntent } from '@content-storyteller/shared';
export interface PlannerInput {
    promptText: string;
    platform: Platform;
    tone: Tone;
    uploadedMediaPaths: string[];
    outputPreference?: OutputPreference;
    trendContext?: {
        desiredOutputType?: string;
    };
}
export declare function resolveOutputIntent(input: PlannerInput): OutputIntent;
//# sourceMappingURL=output-intent.d.ts.map