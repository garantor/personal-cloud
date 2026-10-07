import {
  generateMasterKey,
  deriveKEK,
  deriveMetadataKey,
} from '@personal-cloud/crypto';
import { RecoveryManager, type RecoverySetupResult } from '@personal-cloud/recovery';
import { SyncEngine, type SyncItem, type NetworkPolicy, type DeviceEnvironment } from '@personal-cloud/sync-engine';
import type { StorageProvider } from '@personal-cloud/storage';

export interface MobileClientOptions {
  deviceId: string;
  userId: string;
  storageProvider: StorageProvider;
  masterKey?: Uint8Array;
  networkPolicy?: Partial<NetworkPolicy>;
  deviceEnv?: Partial<DeviceEnvironment>;
}

export class MobileClient {
  readonly deviceId: string;
  readonly userId: string;
  private masterKey: Uint8Array;
  private kek: Uint8Array;
  private metadataKey: Uint8Array;
  readonly syncEngine: SyncEngine;
  private recoveryConfig?: RecoverySetupResult;

  constructor(options: MobileClientOptions) {
    this.deviceId = options.deviceId;
    this.userId = options.userId;
    this.masterKey = options.masterKey || generateMasterKey();
    this.kek = deriveKEK(this.masterKey);
    this.metadataKey = deriveMetadataKey(this.masterKey);

    this.syncEngine = new SyncEngine({
      kek: this.kek,
      metadataKey: this.metadataKey,
      storageProvider: options.storageProvider,
      networkPolicy: options.networkPolicy,
      deviceEnv: options.deviceEnv,
    });
  }

  getMasterKey(): Uint8Array {
    return this.masterKey;
  }

  setMasterKey(key: Uint8Array): void {
    this.masterKey = key;
    this.kek = deriveKEK(this.masterKey);
    this.metadataKey = deriveMetadataKey(this.masterKey);
  }

  initRecovery(): RecoverySetupResult {
    this.recoveryConfig = RecoveryManager.setup(this.masterKey);
    return this.recoveryConfig;
  }

  getRecoveryConfig(): RecoverySetupResult | undefined {
    return this.recoveryConfig;
  }

  /**
   * Simulates taking a photo or video with the camera.
   * Auto-enqueues into sync engine and immediately triggers background processing if online.
   */
  async takePhoto(params: {
    id: string;
    filename: string;
    data: Uint8Array;
    mimeType?: string;
  }): Promise<SyncItem> {
    const item = this.syncEngine.discoverAsset({
      id: params.id,
      filename: params.filename,
      data: params.data,
      mimeType: params.mimeType || 'image/jpeg',
    });

    // Auto backup without manual button press (Acceptance criterion)
    return this.syncEngine.processItem(params.id);
  }

  getStatusSummary(): string {
    const all = this.syncEngine.getAllItems();
    const backedUp = all.filter(i => i.state === 'BACKED_UP').length;
    const active = all.find(i => i.state === 'UPLOADING' || i.state === 'ENCRYPTING');

    if (active) {
      return `Backing up: ${active.metadata.filename} ${active.progressPercent}%`;
    }
    return `✓ ${backedUp} photos backed up`;
  }
}
