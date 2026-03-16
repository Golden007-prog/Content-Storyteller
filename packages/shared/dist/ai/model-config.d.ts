/** All capability slot names */
export type CapabilitySlot = 'text' | 'textFallback' | 'reasoning' | 'image' | 'imageHQ' | 'videoFast' | 'videoFinal' | 'live';
export interface ModelConfigValues {
    projectId: string;
    location: string;
    slots: Record<CapabilitySlot, string>;
    locations: Record<CapabilitySlot, string>;
}
/** Default model identifiers per capability slot */
export declare const MODEL_DEFAULTS: Record<CapabilitySlot, string>;
/** Default Vertex AI location per capability slot */
export declare const LOCATION_DEFAULTS: Record<CapabilitySlot, string>;
/** Environment variable names for per-slot location overrides */
export declare const SLOT_LOCATION_ENV_VARS: Record<CapabilitySlot, string>;
/** Environment variable names per slot */
export declare const SLOT_ENV_VARS: Record<CapabilitySlot, string>;
/**
 * Reads env vars and returns model config with overrides applied.
 * Result is cached as a singleton; use _resetConfigForTesting() to clear.
 */
export declare function getModelConfig(): ModelConfigValues;
/** Get the resolved location for a specific capability slot. */
export declare function getLocationForSlot(slot: CapabilitySlot): string;
/** Reset cached config — for test isolation only. */
export declare function _resetConfigForTesting(): void;
//# sourceMappingURL=model-config.d.ts.map