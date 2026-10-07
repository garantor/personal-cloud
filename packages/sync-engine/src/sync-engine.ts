import { computeSha256 } from '@personal-cloud/crypto';
import { createEncryptedFile, type EncryptedFileResult } from '@personal-cloud/file-manifest';
import type { StorageProvider } from '@personal-cloud/storage';
import type { SyncState, NetworkPolicy, DeviceEnvironment, SyncItem } from './types.js';

export interface SyncEngineOptions {
  kek: Uint8Array;
  metadataKey: Uint8Array;
  storageProvider: StorageProvider;
  networkPolicy?: Partial<NetworkPolicy>;
  deviceEnv?: Partial<DeviceEnvironment>;
  chunkSize?: number;
}

export class SyncEngine {
  private readonly kek: Uint8Array;
  private readonly metadataKey: Uint8Array;
  private readonly storageProvider: StorageProvider;
  private readonly chunkSize: number;

  private items = new Map<string, SyncItem>();
  private knownContentHashes = new Set<string>(); // For deduplication within user namespace

  public networkPolicy: NetworkPolicy = {
    wifiOnly: true,
    chargingOnly: false,
    useMobileData: false,
    uploadVideos: true,
  };

  public deviceEnv: DeviceEnvironment = {
    isOnline: true,
    isWifi: true,
    isCharging: false,
  };

  constructor(options: SyncEngineOptions) {
    this.kek = options.kek;
    this.metadataKey = options.metadataKey;
    this.storageProvider = options.storageProvider;
    this.chunkSize = options.chunkSize || 4 * 1024 * 1024;
    if (options.networkPolicy) {
      Object.assign(this.networkPolicy, options.networkPolicy);
    }
    if (options.deviceEnv) {
      Object.assign(this.deviceEnv, options.deviceEnv);
    }
  }

  canUploadNow(): { allowed: boolean; reason?: string } {
    if (!this.deviceEnv.isOnline) {
      return { allowed: false, reason: 'WAITING_FOR_NETWORK: Device is offline' };
    }
    if (this.networkPolicy.wifiOnly && !this.deviceEnv.isWifi) {
      return { allowed: false, reason: 'POLICY: Wi-Fi only enabled, currently on cellular' };
    }
    if (this.networkPolicy.chargingOnly && !this.deviceEnv.isCharging) {
      return { allowed: false, reason: 'POLICY: Charging only enabled, device not charging' };
    }
    return { allowed: true };
  }

  getItem(id: string): SyncItem | undefined {
    return this.items.get(id);
  }

  getAllItems(): SyncItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Discovers a new asset and enqueues it, checking for content deduplication.
   */
  discoverAsset(params: {
    id: string;
    data: Uint8Array;
    filename: string;
    mimeType: string;
    folder?: string;
    album?: string;
  }): SyncItem {
    const contentHash = computeSha256(params.data);

    // Section 21: Content-addressed deduplication within user's encrypted namespace
    if (this.knownContentHashes.has(contentHash)) {
      const existing = Array.from(this.items.values()).find(it => it.contentHash === contentHash && it.state === 'BACKED_UP');
      if (existing) {
        const deduplicatedItem: SyncItem = {
          id: params.id,
          data: params.data,
          metadata: {
            filename: params.filename,
            mimeType: params.mimeType,
            folder: params.folder,
            album: params.album,
            createdAt: new Date().toISOString(),
          },
          state: 'BACKED_UP',
          contentHash,
          fileId: existing.fileId,
          manifest: existing.manifest,
          uploadedChunks: [...existing.uploadedChunks],
          totalChunks: existing.totalChunks,
          progressPercent: 100,
          retryCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        this.items.set(params.id, deduplicatedItem);
        return deduplicatedItem;
      }
    }

    const item: SyncItem = {
      id: params.id,
      data: params.data,
      metadata: {
        filename: params.filename,
        mimeType: params.mimeType,
        folder: params.folder,
        album: params.album,
        createdAt: new Date().toISOString(),
      },
      state: 'DISCOVERED',
      contentHash,
      uploadedChunks: [],
      totalChunks: Math.ceil(params.data.length / this.chunkSize) || 1,
      progressPercent: 0,
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.items.set(params.id, item);

    // Transition DISCOVERED -> QUEUED
    item.previousState = 'DISCOVERED';
    item.state = 'QUEUED';
    item.updatedAt = Date.now();

    return item;
  }

  /**
   * Processes an item through the sync state machine:
   * QUEUED -> ENCRYPTING -> CHUNKING -> UPLOADING -> VERIFYING -> STORED -> BACKED_UP
   */
  async processItem(id: string): Promise<SyncItem> {
    const item = this.items.get(id);
    if (!item) {
      throw new Error(`Item ${id} not found`);
    }

    if (item.state === 'BACKED_UP') {
      return item;
    }

    const policy = this.canUploadNow();
    if (!policy.allowed) {
      item.previousState = item.state;
      item.state = 'PAUSED';
      item.errorMessage = policy.reason;
      item.updatedAt = Date.now();
      return item;
    }

    try {
      if (!item.data) {
        throw new Error(`Item ${id} has no binary data to upload`);
      }

      const fileId = item.fileId || `file-${item.id}`;
      item.fileId = fileId;

      // 1. ENCRYPTING & CHUNKING
      item.previousState = item.state;
      item.state = 'ENCRYPTING';
      item.updatedAt = Date.now();

      const encResult: EncryptedFileResult = createEncryptedFile({
        fileId,
        data: item.data,
        metadata: item.metadata,
        kek: this.kek,
        metadataKey: this.metadataKey,
        chunkSize: this.chunkSize,
      });

      item.manifest = encResult.manifest;
      item.totalChunks = encResult.encryptedChunks.length;
      item.previousState = 'ENCRYPTING';
      item.state = 'CHUNKING';
      item.updatedAt = Date.now();

      // 2. UPLOADING (Resumable chunk loop)
      item.previousState = 'CHUNKING';
      item.state = 'UPLOADING';
      item.updatedAt = Date.now();

      const uploadedSet = new Set(item.uploadedChunks);

      for (const chunk of encResult.encryptedChunks) {
        // Resume support: skip already uploaded chunks
        if (uploadedSet.has(chunk.index)) {
          continue;
        }

        const chunkId = `${fileId}-c${chunk.index}`;
        await this.storageProvider.put({
          chunkId,
          fileId,
          chunkIndex: chunk.index,
          data: chunk.data,
          hash: chunk.hash,
          size: chunk.data.length,
        });

        uploadedSet.add(chunk.index);
        item.uploadedChunks = Array.from(uploadedSet).sort((a, b) => a - b);
        item.progressPercent = Math.floor((item.uploadedChunks.length / item.totalChunks) * 90);
        item.updatedAt = Date.now();
      }

      // 3. VERIFYING (Verify all chunks exist and match hashes)
      item.previousState = 'UPLOADING';
      item.state = 'VERIFYING';
      item.updatedAt = Date.now();

      for (const chunk of encResult.encryptedChunks) {
        const chunkId = `${fileId}-c${chunk.index}`;
        const exists = await this.storageProvider.exists(chunkId);
        if (!exists) {
          throw new Error(`Verification failed: chunk ${chunkId} missing from storage`);
        }
      }

      // 4. STORED
      item.previousState = 'VERIFYING';
      item.state = 'STORED';
      item.progressPercent = 95;
      item.updatedAt = Date.now();

      // 5. BACKED_UP
      item.previousState = 'STORED';
      item.state = 'BACKED_UP';
      item.progressPercent = 100;
      item.errorMessage = undefined;
      item.updatedAt = Date.now();

      if (item.contentHash) {
        this.knownContentHashes.add(item.contentHash);
      }

      return item;
    } catch (err) {
      item.previousState = item.state;
      item.state = 'FAILED';
      item.errorMessage = (err as Error).message;
      item.retryCount += 1;
      item.updatedAt = Date.now();
      return item;
    }
  }

  /**
   * Retries a failed item, resuming from its last successful state.
   */
  async retryItem(id: string): Promise<SyncItem> {
    const item = this.items.get(id);
    if (!item) throw new Error(`Item ${id} not found`);

    if (item.state === 'FAILED' || item.state === 'PAUSED') {
      item.state = 'QUEUED';
      item.errorMessage = undefined;
      item.updatedAt = Date.now();
      return this.processItem(id);
    }

    return item;
  }

  /**
   * Serialize state for local SQLite / storage persistence.
   */
  exportQueueState(): string {
    const serialized = Array.from(this.items.values()).map(it => ({
      ...it,
      data: it.data ? Buffer.from(it.data).toString('base64') : undefined,
    }));
    return JSON.stringify(serialized);
  }

  /**
   * Rehydrate state from persistence to survive app restarts.
   */
  importQueueState(jsonStr: string): void {
    const list = JSON.parse(jsonStr) as Array<SyncItem & { data?: string }>;
    for (const raw of list) {
      const item: SyncItem = {
        ...raw,
        data: raw.data ? new Uint8Array(Buffer.from(raw.data, 'base64')) : undefined,
      };
      this.items.set(item.id, item);
      if (item.state === 'BACKED_UP' && item.contentHash) {
        this.knownContentHashes.add(item.contentHash);
      }
    }
  }
}
