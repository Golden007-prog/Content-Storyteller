import {
  CapabilitySlot,
  getModelConfig,
  SLOT_ENV_VARS,
  SLOT_LOCATION_ENV_VARS,
} from './model-config';

// ── Types ──────────────────────────────────────────────────────────────

export type SlotStatus = 'available' | 'degraded' | 'unavailable';

export interface ResolvedSlot {
  model: string;
  location: string;
  status: SlotStatus;
  primary: string;
  fallbackUsed: string | null;
  isOverride: boolean;
}

export type ResolvedModelMap = Record<CapabilitySlot, ResolvedSlot>;

// ── Fallback chains ────────────────────────────────────────────────────

export const FALLBACK_CHAINS: Partial<Record<CapabilitySlot, string[]>> = {
  text: ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.0-flash-001'],
  imageHQ: ['gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview'],
  videoFinal: ['veo-3.1-generate-001', 'veo-3.1-fast-generate-001'],
};

// ── Error classes ──────────────────────────────────────────────────────

export class RouterNotInitializedError extends Error {
  constructor() {
    super('ModelRouter has not been initialized. Call initModelRouter() at startup.');
    this.name = 'RouterNotInitializedError';
  }
}

export class ModelUnavailableError extends Error {
  readonly slot: CapabilitySlot;
  constructor(slot: CapabilitySlot) {
    super(`Model for capability "${slot}" is unavailable and has no fallback.`);
    this.name = 'ModelUnavailableError';
    this.slot = slot;
  }
}

// ── Module state ───────────────────────────────────────────────────────

let resolvedMap: ResolvedModelMap | null = null;

// ── Helpers ────────────────────────────────────────────────────────────

const ALL_SLOTS: CapabilitySlot[] = [
  'text', 'textFallback', 'reasoning', 'image',
  'imageHQ', 'videoFast', 'videoFinal', 'live',
];

function isEnvOverride(slot: CapabilitySlot): boolean {
  const envVar = SLOT_ENV_VARS[slot];
  return !!process.env[envVar];
}

function isLocationEnvOverride(slot: CapabilitySlot): boolean {
  const envVar = SLOT_LOCATION_ENV_VARS[slot];
  return !!process.env[envVar];
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Initialize the model router. Performs availability checks for each slot,
 * walks fallback chains as needed, and caches the immutable resolved map.
 * Must be called once at service startup.
 */
export async function initModelRouter(options?: {
  checkAvailability?: (model: string, projectId: string, location: string) => Promise<boolean>;
}): Promise<ResolvedModelMap> {
  const config = getModelConfig();
  const { projectId, slots, locations } = config;
  const checkAvailability = options?.checkAvailability ?? (async () => true);

  const map = {} as Record<CapabilitySlot, ResolvedSlot>;

  for (const slot of ALL_SLOTS) {
    const primary = slots[slot];
    const slotLocation = locations[slot];
    const override = isEnvOverride(slot);

    // Env overrides skip availability checks entirely
    if (override) {
      map[slot] = {
        model: primary,
        location: slotLocation,
        status: 'available',
        primary,
        fallbackUsed: null,
        isOverride: true,
      };
      console.log(`[ModelRouter] ${slot}: ${primary} @ ${slotLocation} (env override)`);
      continue;
    }

    const chain = FALLBACK_CHAINS[slot];

    if (chain) {
      // Slot has a fallback chain — walk it
      let resolved = false;
      for (const candidate of chain) {
        const available = await checkAvailability(candidate, projectId, slotLocation);
        if (available) {
          const usedFallback = candidate !== primary ? candidate : null;
          map[slot] = {
            model: candidate,
            location: slotLocation,
            status: 'available',
            primary,
            fallbackUsed: usedFallback,
            isOverride: false,
          };
          if (usedFallback) {
            console.warn(`[ModelRouter] ${slot}: primary ${primary} unavailable, using fallback ${candidate} @ ${slotLocation}`);
          } else {
            console.log(`[ModelRouter] ${slot}: ${candidate} @ ${slotLocation}`);
          }
          resolved = true;
          break;
        }
      }

      if (!resolved) {
        // All models in chain unavailable — mark degraded, use last in chain
        const lastModel = chain[chain.length - 1];
        map[slot] = {
          model: lastModel,
          location: slotLocation,
          status: 'degraded',
          primary,
          fallbackUsed: lastModel !== primary ? lastModel : null,
          isOverride: false,
        };
        console.error(`[ModelRouter] ${slot}: all models unavailable, marked degraded (using ${lastModel} @ ${slotLocation})`);
      }
    } else {
      // No fallback chain — check primary directly
      const available = await checkAvailability(primary, projectId, slotLocation);
      if (available) {
        map[slot] = {
          model: primary,
          location: slotLocation,
          status: 'available',
          primary,
          fallbackUsed: null,
          isOverride: false,
        };
        console.log(`[ModelRouter] ${slot}: ${primary} @ ${slotLocation}`);
      } else {
        map[slot] = {
          model: primary,
          location: slotLocation,
          status: 'unavailable',
          primary,
          fallbackUsed: null,
          isOverride: false,
        };
        console.error(`[ModelRouter] ${slot}: ${primary} unavailable @ ${slotLocation}, no fallback`);
      }
    }
  }

  resolvedMap = Object.freeze(map) as ResolvedModelMap;
  return resolvedMap;
}

/**
 * Get the resolved model for a capability slot.
 * Throws RouterNotInitializedError if initModelRouter() has not been called.
 * Throws ModelUnavailableError if the slot is marked unavailable.
 */
export function getModel(slot: CapabilitySlot): string {
  if (!resolvedMap) throw new RouterNotInitializedError();
  const info = resolvedMap[slot];
  if (info.status === 'unavailable') throw new ModelUnavailableError(slot);
  return info.model;
}

/**
 * Get the resolved location for a capability slot.
 * Throws RouterNotInitializedError if initModelRouter() has not been called.
 */
export function getLocation(slot: CapabilitySlot): string {
  if (!resolvedMap) throw new RouterNotInitializedError();
  return resolvedMap[slot].location;
}

/**
 * Get the full resolved slot info (model, status, fallback info).
 */
export function getSlotInfo(slot: CapabilitySlot): ResolvedSlot {
  if (!resolvedMap) throw new RouterNotInitializedError();
  return resolvedMap[slot];
}

/**
 * Get the entire resolved model map (for health endpoints).
 */
export function getResolvedModels(): ResolvedModelMap {
  if (!resolvedMap) throw new RouterNotInitializedError();
  return resolvedMap;
}

/**
 * Reset router state — for test isolation only.
 */
export function _resetRouterForTesting(): void {
  resolvedMap = null;
}
