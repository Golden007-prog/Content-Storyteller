/** All capability slot names */
export type CapabilitySlot =
  | 'text'
  | 'textFallback'
  | 'reasoning'
  | 'image'
  | 'imageHQ'
  | 'videoFast'
  | 'videoFinal'
  | 'live';

export interface ModelConfigValues {
  projectId: string;
  location: string;
  slots: Record<CapabilitySlot, string>;
  locations: Record<CapabilitySlot, string>;
}

/** Default model identifiers per capability slot */
export const MODEL_DEFAULTS: Record<CapabilitySlot, string> = {
  text: 'gemini-3-flash-preview',
  textFallback: 'gemini-3-flash-preview',
  reasoning: 'gemini-3.1-pro-preview',
  image: 'gemini-3.1-flash-image-preview',
  imageHQ: 'gemini-3-pro-image-preview',
  videoFast: 'veo-3.1-fast-generate-001',
  videoFinal: 'veo-3.1-generate-001',
  live: 'gemini-live-2.5-flash-native-audio',
};

/** Default Vertex AI location per capability slot */
export const LOCATION_DEFAULTS: Record<CapabilitySlot, string> = {
  text: 'global',
  textFallback: 'global',
  reasoning: 'global',
  image: 'global',
  imageHQ: 'global',
  videoFast: 'us-central1',
  videoFinal: 'us-central1',
  live: 'global',
};

/** Environment variable names for per-slot location overrides */
export const SLOT_LOCATION_ENV_VARS: Record<CapabilitySlot, string> = {
  text: 'VERTEX_TEXT_LOCATION',
  textFallback: 'VERTEX_TEXT_FALLBACK_LOCATION',
  reasoning: 'VERTEX_REASONING_LOCATION',
  image: 'VERTEX_IMAGE_LOCATION',
  imageHQ: 'VERTEX_IMAGE_HQ_LOCATION',
  videoFast: 'VERTEX_VIDEO_FAST_LOCATION',
  videoFinal: 'VERTEX_VIDEO_FINAL_LOCATION',
  live: 'VERTEX_LIVE_LOCATION',
};

/** Environment variable names per slot */
export const SLOT_ENV_VARS: Record<CapabilitySlot, string> = {
  text: 'VERTEX_TEXT_MODEL',
  textFallback: 'VERTEX_TEXT_FALLBACK_MODEL',
  reasoning: 'VERTEX_REASONING_MODEL',
  image: 'VERTEX_IMAGE_MODEL',
  imageHQ: 'VERTEX_IMAGE_HQ_MODEL',
  videoFast: 'VERTEX_VIDEO_FAST_MODEL',
  videoFinal: 'VERTEX_VIDEO_FINAL_MODEL',
  live: 'VERTEX_LIVE_MODEL',
};

let cachedConfig: ModelConfigValues | null = null;

/**
 * Reads env vars and returns model config with overrides applied.
 * Result is cached as a singleton; use _resetConfigForTesting() to clear.
 */
export function getModelConfig(): ModelConfigValues {
  if (cachedConfig) return cachedConfig;

  const slots = { ...MODEL_DEFAULTS };

  for (const [slot, envVar] of Object.entries(SLOT_ENV_VARS)) {
    const value = process.env[envVar];
    if (value) {
      slots[slot as CapabilitySlot] = value;
    }
  }

  const locations = { ...LOCATION_DEFAULTS };

  for (const [slot, envVar] of Object.entries(SLOT_LOCATION_ENV_VARS)) {
    const value = process.env[envVar];
    if (value) {
      locations[slot as CapabilitySlot] = value;
    }
  }

  cachedConfig = {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    slots,
    locations,
  };

  return cachedConfig;
}

/** Get the resolved location for a specific capability slot. */
export function getLocationForSlot(slot: CapabilitySlot): string {
  return getModelConfig().locations[slot];
}

/** Reset cached config — for test isolation only. */
export function _resetConfigForTesting(): void {
  cachedConfig = null;
}
