import type {
  StorageProvider,
  EncryptedChunk,
  DurabilityState
} from '@personal-cloud/storage';
import { DurabilityTracker } from '@personal-cloud/storage';

export class StorageOrchestrator {
  private providers = new Map<string, StorageProvider>();
  readonly durability = new DurabilityTracker();

  registerProvider(provider: StorageProvider): void {
    this.providers.set(provider.id, provider);
  }

  async storeChunkWithReplication(chunk: EncryptedChunk, targetProviderIds?: string[]): Promise<string[]> {
    const targets = targetProviderIds || Array.from(this.providers.keys());
    const storedOn: string[] = [];

    for (const pid of targets) {
      const provider = this.providers.get(pid);
      if (!provider) continue;

      try {
        await provider.put(chunk);
        this.durability.recordChunkStored(chunk.chunkId, pid);
        storedOn.push(pid);
      } catch (err) {
        console.warn(`Failed to store chunk ${chunk.chunkId} on ${pid}:`, (err as Error).message);
      }
    }

    return storedOn;
  }

  async retrieveChunk(chunkId: string): Promise<EncryptedChunk> {
    const locations = this.durability.getChunkProviders(chunkId);
    for (const pid of locations) {
      const p = this.providers.get(pid);
      if (p) {
        try {
          return await p.get(chunkId);
        } catch {
          // try next replica
        }
      }
    }
    throw new Error(`Chunk ${chunkId} could not be retrieved from any active provider`);
  }

  getChunkDurability(chunkId: string): DurabilityState {
    return this.durability.getDurabilityState(chunkId);
  }
}
