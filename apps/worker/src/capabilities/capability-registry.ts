import { GenerationCapability } from '@content-storyteller/shared';
import { GifGenerationCapability } from './gif-generation';
import { ImageGenerationCapability } from './image-generation';
import { VideoGenerationCapability } from './video-generation';

/**
 * Registry of generation capabilities. Pipeline stages use this to check
 * availability before attempting AI generation calls.
 *
 * Capabilities are registered at startup. If a capability is not registered
 * or reports itself as unavailable, the pipeline stage records a fallback
 * notice and continues.
 */
class CapabilityRegistry {
  private capabilities = new Map<string, GenerationCapability>();
  private initialized = false;

  register(capability: GenerationCapability): void {
    this.capabilities.set(capability.name, capability);
  }

  get(name: string): GenerationCapability | undefined {
    return this.capabilities.get(name);
  }

  has(name: string): boolean {
    return this.capabilities.has(name);
  }

  all(): GenerationCapability[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Initialize the registry with all known capabilities.
   * Safe to call multiple times — only registers on first call.
   */
  init(): void {
    if (this.initialized) return;
    this.register(new ImageGenerationCapability());
    this.register(new VideoGenerationCapability());
    this.register(new GifGenerationCapability());
    this.initialized = true;
  }
}

/** Singleton capability registry instance */
export const capabilityRegistry = new CapabilityRegistry();

// Auto-initialize on import so pipeline stages can use capabilities immediately
capabilityRegistry.init();
