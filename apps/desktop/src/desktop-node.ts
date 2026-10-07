import fs from 'node:fs/promises';
import path from 'node:path';
import { computeSha256 } from '@personal-cloud/crypto';
import { LocalStorageProvider, type StorageHealth, type EncryptedChunk } from '@personal-cloud/storage';
import type { StorageNodeInfo, RelayChunkEnvelope, RelayAck } from '@personal-cloud/protocol';

export interface DesktopNodeOptions {
  nodeId?: string;
  deviceId: string;
  userId: string;
  storageDir: string;
  allocatedBytes?: number; // e.g. 500 GB
  minFreeDiskPercent?: number; // e.g. 20%
}

export class DesktopStorageNode {
  readonly nodeId: string;
  readonly deviceId: string;
  readonly userId: string;
  private readonly storageDir: string;
  private allocatedBytes: number;
  private readonly minFreeDiskPercent: number;
  private readonly localProvider: LocalStorageProvider;
  private isRunning: boolean = false;
  private transferTokens = new Set<string>();

  constructor(options: DesktopNodeOptions) {
    this.nodeId = options.nodeId || `node-${options.deviceId}`;
    this.deviceId = options.deviceId;
    this.userId = options.userId;
    this.storageDir = path.resolve(options.storageDir);
    this.allocatedBytes = options.allocatedBytes ?? 500 * 1024 * 1024 * 1024; // 500 GB
    this.minFreeDiskPercent = options.minFreeDiskPercent ?? 20;

    this.localProvider = new LocalStorageProvider({
      id: this.nodeId,
      name: `Desktop Node (${this.deviceId})`,
      baseDir: this.storageDir,
      allocatedBytes: this.allocatedBytes,
    });
  }

  async start(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
    // Write node configuration file
    const configPath = path.join(this.storageDir, 'node-config.json');
    await fs.writeFile(configPath, JSON.stringify({
      nodeId: this.nodeId,
      deviceId: this.deviceId,
      userId: this.userId,
      allocatedBytes: this.allocatedBytes,
      updatedAt: new Date().toISOString(),
    }, null, 2));

    this.isRunning = true;
  }

  async stop(): Promise<void> {
    this.isRunning = false;
  }

  setAllocatedCapacity(bytes: number): void {
    this.allocatedBytes = bytes;
  }

  async receiveEncryptedChunk(chunk: EncryptedChunk): Promise<RelayAck> {
    if (!this.isRunning) {
      throw new Error('Desktop storage node is offline');
    }

    // Verify hash integrity before storing
    const calculatedHash = computeSha256(chunk.data);
    if (chunk.hash && calculatedHash !== chunk.hash) {
      return {
        relaySessionId: 'direct',
        fileId: chunk.fileId,
        chunkIndex: chunk.chunkIndex,
        nodeId: this.nodeId,
        success: false,
        error: `Integrity check failed: expected ${chunk.hash}, got ${calculatedHash}`,
      };
    }

    // Atomic storage
    await this.localProvider.put({
      chunkId: chunk.chunkId,
      fileId: chunk.fileId,
      chunkIndex: chunk.chunkIndex,
      data: chunk.data,
      hash: calculatedHash,
      size: chunk.data.length,
    });

    this.transferTokens.add(`${chunk.fileId}:${chunk.chunkIndex}`);

    return {
      relaySessionId: 'direct',
      fileId: chunk.fileId,
      chunkIndex: chunk.chunkIndex,
      nodeId: this.nodeId,
      success: true,
    };
  }

  async receiveRelayEnvelope(envelope: RelayChunkEnvelope): Promise<RelayAck> {
    const chunkData = new Uint8Array(Buffer.from(envelope.dataBase64, 'base64'));
    return this.receiveEncryptedChunk({
      chunkId: `${envelope.fileId}-c${envelope.chunkIndex}`,
      fileId: envelope.fileId,
      chunkIndex: envelope.chunkIndex,
      data: chunkData,
      hash: envelope.hash,
      size: chunkData.length,
    });
  }

  async getHealth(): Promise<StorageHealth> {
    return this.localProvider.health();
  }

  async getInfo(): Promise<StorageNodeInfo> {
    const health = await this.getHealth();
    return {
      nodeId: this.nodeId,
      deviceId: this.deviceId,
      userId: this.userId,
      allocatedBytes: health.allocatedBytes,
      usedBytes: health.usedBytes,
      availableBytes: health.availableBytes,
      status: this.isRunning ? 'online' : 'offline',
      lastHeartbeat: new Date().toISOString(),
    };
  }

  async readChunk(chunkId: string): Promise<EncryptedChunk> {
    return this.localProvider.get(chunkId);
  }

  async hasChunk(chunkId: string): Promise<boolean> {
    return this.localProvider.exists(chunkId);
  }
}
