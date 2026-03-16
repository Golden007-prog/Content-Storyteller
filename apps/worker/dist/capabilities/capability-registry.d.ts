import { GenerationCapability } from '@content-storyteller/shared';
/**
 * Registry of generation capabilities. Pipeline stages use this to check
 * availability before attempting AI generation calls.
 *
 * Capabilities are registered at startup. If a capability is not registered
 * or reports itself as unavailable, the pipeline stage records a fallback
 * notice and continues.
 */
declare class CapabilityRegistry {
    private capabilities;
    private initialized;
    register(capability: GenerationCapability): void;
    get(name: string): GenerationCapability | undefined;
    has(name: string): boolean;
    all(): GenerationCapability[];
    /**
     * Initialize the registry with all known capabilities.
     * Safe to call multiple times — only registers on first call.
     */
    init(): void;
}
/** Singleton capability registry instance */
export declare const capabilityRegistry: CapabilityRegistry;
export {};
//# sourceMappingURL=capability-registry.d.ts.map