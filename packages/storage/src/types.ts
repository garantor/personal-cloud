export interface EncryptedChunk {
  chunkId: string;
  fileId: string;
  chunkIndex: number;
  data: Uint8Array;
  hash: string;
  size: number;
}

export interface StorageReceipt {
  chunkId: string;
  storageProviderId: string;
  bytesWritten: number;
  contentHash: string;
  timestamp: number;
}

export interface StorageHealth {
  status: 'healthy' | 'degraded' | 'offline';
  allocatedBytes: number;
  usedBytes: number;
  availableBytes: number;
  latencyMs: number;
}

export interface StorageProvider {
  readonly id: string;
  readonly name: string;
  put(chunk: EncryptedChunk): Promise<StorageReceipt>;
  get(chunkId: string): Promise<EncryptedChunk>;
  delete(chunkId: string): Promise<void>;
  exists(chunkId: string): Promise<boolean>;
  health(): Promise<StorageHealth>;
}

export type DurabilityState =
  | 'LOCAL_ONLY'
  | 'SYNCED_TO_DEVICE'
  | 'REMOTE_BACKUP'
  | 'MULTIPLE_REPLICAS';
