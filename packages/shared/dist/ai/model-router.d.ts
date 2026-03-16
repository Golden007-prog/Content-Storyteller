import { CapabilitySlot } from './model-config';
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
export declare const FALLBACK_CHAINS: Partial<Record<CapabilitySlot, string[]>>;
export declare class RouterNotInitializedError extends Error {
    constructor();
}
export declare class ModelUnavailableError extends Error {
    readonly slot: CapabilitySlot;
    constructor(slot: CapabilitySlot);
}
/**
 * Initialize the model router. Performs availability checks for each slot,
 * walks fallback chains as needed, and caches the immutable resolved map.
 * Must be called once at service startup.
 */
export declare function initModelRouter(options?: {
    checkAvailability?: (model: string, projectId: string, location: string) => Promise<boolean>;
}): Promise<ResolvedModelMap>;
/**
 * Get the resolved model for a capability slot.
 * Throws RouterNotInitializedError if initModelRouter() has not been called.
 * Throws ModelUnavailableError if the slot is marked unavailable.
 */
export declare function getModel(slot: CapabilitySlot): string;
/**
 * Get the resolved location for a capability slot.
 * Throws RouterNotInitializedError if initModelRouter() has not been called.
 */
export declare function getLocation(slot: CapabilitySlot): string;
/**
 * Get the full resolved slot info (model, status, fallback info).
 */
export declare function getSlotInfo(slot: CapabilitySlot): ResolvedSlot;
/**
 * Get the entire resolved model map (for health endpoints).
 */
export declare function getResolvedModels(): ResolvedModelMap;
/**
 * Reset router state — for test isolation only.
 */
export declare function _resetRouterForTesting(): void;
//# sourceMappingURL=model-router.d.ts.map