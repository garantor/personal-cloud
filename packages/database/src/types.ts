import type { DeviceType } from '@personal-cloud/protocol';

export interface UserEntity {
  id: string;
  email: string;
  passkeyCredentialId?: string;
  passkeyPublicKey?: string;
  createdAt: string;
}

export interface DeviceEntity {
  id: string;
  userId: string;
  name: string;
  type: DeviceType;
  publicKey: string;
  isRevoked: boolean;
  lastSeenAt: string;
  createdAt: string;
}

export interface StorageNodeEntity {
  id: string;
  deviceId: string;
  userId: string;
  allocatedBytes: number;
  usedBytes: number;
  availableBytes: number;
  status: 'online' | 'offline' | 'degraded';
  lastHeartbeat: string;
}

export interface FileEntity {
  id: string;
  userId: string;
  version: number;
  contentHash: string;
  totalPlaintextSize: number;
  totalEncryptedSize: number;
  encryptedMetadata: string;
  metadataIv: string;
  metadataTag: string;
  wrappedFileKey: string; // JSON string of WrappedKeyPayload
  createdAt: string;
  updatedAt: string;
}

export interface FileChunkEntity {
  id: string;
  fileId: string;
  chunkIndex: number;
  hash: string;
  size: number;
  iv: string;
  tag: string;
}

export interface StorageLocationEntity {
  id: string;
  chunkId: string;
  storageNodeId: string;
  providerType: string;
  verifiedAt: string;
}

export interface RecoveryConfigEntity {
  userId: string;
  remoteSharePayload: string;
  updatedAt: string;
}

export interface SessionEntity {
  id: string;
  userId: string;
  deviceId: string;
  token: string;
  expiresAt: string;
}
