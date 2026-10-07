import type { DurabilityState, StorageProvider, EncryptedChunk } from './types.js';

export interface ChunkLocation {
  chunkId: string;
  providerId: string;
  isVerified: boolean;
  timestamp: number;
}

export class DurabilityTracker {
  private readonly chunkLocations = new Map<string, ChunkLocation[]>();

  recordChunkStored(chunkId: string, providerId: string): void {
    const list = this.chunkLocations.get(chunkId) || [];
    if (!list.some(loc => loc.providerId === providerId)) {
      list.push({
        chunkId,
        providerId,
        isVerified: true,
        timestamp: Date.now(),
      });
      this.chunkLocations.set(chunkId, list);
    }
  }

  getChunkProviders(chunkId: string): string[] {
    const list = this.chunkLocations.get(chunkId) || [];
    return list.map(l => l.providerId);
  }

  getDurabilityState(chunkId: string): DurabilityState {
    const list = this.chunkLocations.get(chunkId) || [];
    const count = list.length;
    if (count === 0) return 'LOCAL_ONLY';
    if (count === 1) {
      const p = list[0].providerId.toLowerCase();
      if (p.includes('remote') || p.includes('storj') || p.includes('filecoin')) {
        return 'REMOTE_BACKUP';
      }
      return 'SYNCED_TO_DEVICE';
    }
    const hasRemote = list.some(l => {
      const p = l.providerId.toLowerCase();
      return p.includes('remote') || p.includes('storj') || p.includes('filecoin');
    });
    const hasNode = list.some(l => !l.providerId.toLowerCase().includes('remote'));

    if (count >= 2 && (hasRemote || hasNode)) {
      return 'MULTIPLE_REPLICAS';
    }
    return 'SYNCED_TO_DEVICE';
  }

  /**
   * Rule 10: Never delete the only copy of a file/chunk before another verified copy exists.
   */
  canSafelyPruneLocalCopy(chunkId: string): boolean {
    const list = this.chunkLocations.get(chunkId) || [];
    // Must exist on at least one verified external provider (desktop node or remote backup)
    return list.some(l => l.isVerified && l.providerId !== 'local-origin');
  }
}
