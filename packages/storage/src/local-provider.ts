import fs from 'node:fs/promises';
import path from 'node:path';
import { computeSha256 } from '@personal-cloud/crypto';
import type { StorageProvider, EncryptedChunk, StorageReceipt, StorageHealth } from './types.js';

export interface LocalStorageProviderOptions {
  id?: string;
  name?: string;
  baseDir: string;
  allocatedBytes?: number;
}

export class LocalStorageProvider implements StorageProvider {
  readonly id: string;
  readonly name: string;
  private readonly baseDir: string;
  private readonly allocatedBytes: number;

  constructor(options: LocalStorageProviderOptions) {
    this.id = options.id || 'local-provider-default';
    this.name = options.name || 'Local Storage Provider';
    this.baseDir = path.resolve(options.baseDir);
    this.allocatedBytes = options.allocatedBytes || 500 * 1024 * 1024 * 1024; // 500 GB default
  }

  private getChunkPath(chunkId: string): string {
    const cleanId = chunkId.replace(/[^a-zA-Z0-9_-]/g, '');
    const prefix1 = cleanId.slice(0, 2) || '00';
    const prefix2 = cleanId.slice(2, 4) || '00';
    return path.join(this.baseDir, 'blobs', prefix1, prefix2, `${cleanId}.blob`);
  }

  private getMetaPath(chunkId: string): string {
    const cleanId = chunkId.replace(/[^a-zA-Z0-9_-]/g, '');
    const prefix1 = cleanId.slice(0, 2) || '00';
    const prefix2 = cleanId.slice(2, 4) || '00';
    return path.join(this.baseDir, 'blobs', prefix1, prefix2, `${cleanId}.meta.json`);
  }

  async put(chunk: EncryptedChunk): Promise<StorageReceipt> {
    const filePath = this.getChunkPath(chunk.chunkId);
    const metaPath = this.getMetaPath(chunk.chunkId);

    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Verify hash integrity before writing
    const calculatedHash = computeSha256(chunk.data);
    if (chunk.hash && calculatedHash !== chunk.hash) {
      throw new Error(`Integrity check failed: chunk hash mismatch for ${chunk.chunkId}`);
    }

    // Atomic write via temp file
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, chunk.data);
    await fs.rename(tempPath, filePath);

    const meta = {
      chunkId: chunk.chunkId,
      fileId: chunk.fileId,
      chunkIndex: chunk.chunkIndex,
      hash: calculatedHash,
      size: chunk.data.length,
      timestamp: Date.now(),
    };
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    return {
      chunkId: chunk.chunkId,
      storageProviderId: this.id,
      bytesWritten: chunk.data.length,
      contentHash: calculatedHash,
      timestamp: meta.timestamp,
    };
  }

  async get(chunkId: string): Promise<EncryptedChunk> {
    const filePath = this.getChunkPath(chunkId);
    const metaPath = this.getMetaPath(chunkId);

    try {
      const data = await fs.readFile(filePath);
      const metaContent = await fs.readFile(metaPath, 'utf8');
      const meta = JSON.parse(metaContent);

      return {
        chunkId,
        fileId: meta.fileId,
        chunkIndex: meta.chunkIndex,
        data: new Uint8Array(data),
        hash: meta.hash,
        size: data.length,
      };
    } catch (err) {
      throw new Error(`Chunk ${chunkId} not found or corrupted: ${(err as Error).message}`);
    }
  }

  async delete(chunkId: string): Promise<void> {
    const filePath = this.getChunkPath(chunkId);
    const metaPath = this.getMetaPath(chunkId);

    await Promise.allSettled([
      fs.unlink(filePath),
      fs.unlink(metaPath),
    ]);
  }

  async exists(chunkId: string): Promise<boolean> {
    try {
      await fs.access(this.getChunkPath(chunkId));
      return true;
    } catch {
      return false;
    }
  }

  async health(): Promise<StorageHealth> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      let usedBytes = 0;
      
      const calculateSize = async (dir: string) => {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await calculateSize(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.blob')) {
              const stat = await fs.stat(fullPath);
              usedBytes += stat.size;
            }
          }
        } catch {
          // ignore directory traversal errors
        }
      };

      await calculateSize(path.join(this.baseDir, 'blobs'));

      const availableBytes = Math.max(0, this.allocatedBytes - usedBytes);
      return {
        status: 'healthy',
        allocatedBytes: this.allocatedBytes,
        usedBytes,
        availableBytes,
        latencyMs: 1,
      };
    } catch {
      return {
        status: 'degraded',
        allocatedBytes: this.allocatedBytes,
        usedBytes: 0,
        availableBytes: this.allocatedBytes,
        latencyMs: 999,
      };
    }
  }
}
