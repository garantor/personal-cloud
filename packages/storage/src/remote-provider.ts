import { computeSha256 } from '@personal-cloud/crypto';
import type { StorageProvider, EncryptedChunk, StorageReceipt, StorageHealth } from './types.js';

export interface RemoteBackupProviderOptions {
  id?: string;
  name?: string;
  endpointUrl?: string;
}

/**
 * Remote backup provider representing offsite/cloud relay object store.
 */
export class RemoteBackupProvider implements StorageProvider {
  readonly id: string;
  readonly name: string;
  private readonly endpointUrl: string;
  private readonly memoryStore = new Map<string, { data: Uint8Array; hash: string; fileId: string; chunkIndex: number }>();

  constructor(options: RemoteBackupProviderOptions = {}) {
    this.id = options.id || 'remote-backup-default';
    this.name = options.name || 'Remote Encrypted Relay / Backup';
    this.endpointUrl = options.endpointUrl || 'https://relay.personalcloud.local';
  }

  async put(chunk: EncryptedChunk): Promise<StorageReceipt> {
    const hash = computeSha256(chunk.data);
    this.memoryStore.set(chunk.chunkId, {
      data: new Uint8Array(chunk.data),
      hash,
      fileId: chunk.fileId,
      chunkIndex: chunk.chunkIndex,
    });

    return {
      chunkId: chunk.chunkId,
      storageProviderId: this.id,
      bytesWritten: chunk.data.length,
      contentHash: hash,
      timestamp: Date.now(),
    };
  }

  async get(chunkId: string): Promise<EncryptedChunk> {
    const record = this.memoryStore.get(chunkId);
    if (!record) {
      throw new Error(`Chunk ${chunkId} not found on remote provider ${this.id}`);
    }
    return {
      chunkId,
      fileId: record.fileId,
      chunkIndex: record.chunkIndex,
      data: record.data,
      hash: record.hash,
      size: record.data.length,
    };
  }

  async delete(chunkId: string): Promise<void> {
    this.memoryStore.delete(chunkId);
  }

  async exists(chunkId: string): Promise<boolean> {
    return this.memoryStore.has(chunkId);
  }

  async health(): Promise<StorageHealth> {
    let usedBytes = 0;
    for (const item of this.memoryStore.values()) {
      usedBytes += item.data.length;
    }
    return {
      status: 'healthy',
      allocatedBytes: 10 * 1024 * 1024 * 1024 * 1024, // 10 TB remote quota
      usedBytes,
      availableBytes: 10 * 1024 * 1024 * 1024 * 1024 - usedBytes,
      latencyMs: 15,
    };
  }
}
