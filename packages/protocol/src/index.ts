export type DeviceType = 'mobile_ios' | 'mobile_android' | 'desktop_mac' | 'desktop_windows' | 'desktop_linux' | 'web';

export interface DeviceInfo {
  deviceId: string;
  userId: string;
  name: string;
  type: DeviceType;
  publicKey: string;
  createdAt: string;
  lastSeenAt: string;
  isRevoked: boolean;
}

export interface StorageNodeInfo {
  nodeId: string;
  deviceId: string;
  userId: string;
  allocatedBytes: number;
  usedBytes: number;
  availableBytes: number;
  status: 'online' | 'offline' | 'degraded';
  lastHeartbeat: string;
}

export type SyncEvent =
  | { type: 'device.registered'; device: DeviceInfo }
  | { type: 'device.revoked'; deviceId: string }
  | { type: 'file.created'; fileId: string; version: number }
  | { type: 'file.updated'; fileId: string; version: number }
  | { type: 'chunk.stored'; fileId: string; chunkIndex: number; hash: string; nodeId: string }
  | { type: 'node.heartbeat'; node: StorageNodeInfo }
  | { type: 'sync.progress'; fileId: string; percent: number; status: string };

export interface RelayChunkEnvelope {
  relaySessionId: string;
  senderDeviceId: string;
  recipientNodeId: string;
  fileId: string;
  chunkIndex: number;
  hash: string;
  dataBase64: string;
}

export interface RelayAck {
  relaySessionId: string;
  fileId: string;
  chunkIndex: number;
  nodeId: string;
  success: boolean;
  error?: string;
}
