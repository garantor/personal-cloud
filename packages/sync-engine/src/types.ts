import type { EncryptedFileManifest, FileMetadataPlaintext } from '@personal-cloud/file-manifest';

export type SyncState =
  | 'DISCOVERED'
  | 'QUEUED'
  | 'ENCRYPTING'
  | 'CHUNKING'
  | 'UPLOADING'
  | 'VERIFYING'
  | 'STORED'
  | 'BACKED_UP'
  | 'FAILED'
  | 'PAUSED';

export interface NetworkPolicy {
  wifiOnly: boolean;
  chargingOnly: boolean;
  useMobileData: boolean;
  uploadVideos: boolean;
}

export interface DeviceEnvironment {
  isOnline: boolean;
  isWifi: boolean;
  isCharging: boolean;
}

export interface SyncItem {
  id: string; // asset_id
  localPath?: string;
  data?: Uint8Array;
  metadata: FileMetadataPlaintext;
  state: SyncState;
  previousState?: SyncState;
  fileId?: string;
  contentHash?: string;
  manifest?: EncryptedFileManifest;
  uploadedChunks: number[];
  totalChunks: number;
  progressPercent: number;
  retryCount: number;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}
