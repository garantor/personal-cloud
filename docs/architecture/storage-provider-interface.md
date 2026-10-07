# Storage Provider Interface & Abstraction Layer

## 1. Unified Interface

All physical and virtual storage backends implement the `StorageProvider` interface:

```typescript
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

export interface EncryptedChunk {
  chunkId: string;
  fileId: string;
  chunkIndex: number;
  data: Uint8Array | Buffer;
  hash: string;
  size: number;
}

export interface StorageProvider {
  id: string;
  name: string;
  put(chunk: EncryptedChunk): Promise<StorageReceipt>;
  get(chunkId: string): Promise<EncryptedChunk>;
  delete(chunkId: string): Promise<void>;
  exists(chunkId: string): Promise<boolean>;
  health(): Promise<StorageHealth>;
}
```

## 2. Implementations
1. **`LocalStorageProvider`**: Stores chunks directly in the local file system with atomic writes and directory partitioning (`data/blobs/ab/cd/chunkId`).
2. **`PersonalNodeProvider`**: Proxies chunk reads and writes to a user's desktop node via the secure backend relay.
3. **`RemoteBackupProvider`**: Replicates chunks to decentralized storage backends (Storj / Filecoin / S3 compatible) without altering client contracts.
4. **`DecentralizedStorageAdapter`**: Bridges chunk operations to decentralized storage networks, validating proofs and recording storage commitments.

## 3. Storage Durability States
Every file tracks its durability state across providers:
- `LOCAL_ONLY`: Exists only on the originating mobile/local client.
- `SYNCED_TO_DEVICE`: Stored on at least one authenticated personal device (e.g., desktop node).
- `REMOTE_BACKUP`: Stored on a remote backup provider or decentralized network.
- `MULTIPLE_REPLICAS`: Confirmed stored on two or more distinct personal nodes and remote backup.
