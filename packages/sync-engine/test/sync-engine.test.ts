import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMasterKey, deriveKEK, deriveMetadataKey } from '@personal-cloud/crypto';
import { RemoteBackupProvider } from '@personal-cloud/storage';
import { SyncEngine } from '../src/index.js';

test('SyncEngine: End-to-end state machine progression', async () => {
  const masterKey = generateMasterKey();
  const kek = deriveKEK(masterKey);
  const metadataKey = deriveMetadataKey(masterKey);
  const storage = new RemoteBackupProvider();

  const engine = new SyncEngine({
    kek,
    metadataKey,
    storageProvider: storage,
    chunkSize: 8 * 1024, // 8 KB chunks
  });

  const photoData = Buffer.from('photo binary raw payload '.repeat(500));
  const item = engine.discoverAsset({
    id: 'asset-1',
    data: photoData,
    filename: 'IMG_001.jpg',
    mimeType: 'image/jpeg',
  });

  assert.equal(item.state, 'QUEUED');
  assert.equal(item.progressPercent, 0);

  const completed = await engine.processItem('asset-1');
  assert.equal(completed.state, 'BACKED_UP');
  assert.equal(completed.progressPercent, 100);
  assert.ok(completed.uploadedChunks.length > 1);
  assert.ok(completed.manifest);
});

test('SyncEngine: Content deduplication within user namespace', async () => {
  const masterKey = generateMasterKey();
  const kek = deriveKEK(masterKey);
  const metadataKey = deriveMetadataKey(masterKey);
  const storage = new RemoteBackupProvider();

  const engine = new SyncEngine({
    kek,
    metadataKey,
    storageProvider: storage,
  });

  const data = Buffer.from('identical photo data');
  engine.discoverAsset({
    id: 'photo-1',
    data,
    filename: 'photo1.png',
    mimeType: 'image/png',
  });
  await engine.processItem('photo-1');

  // Discover identical content under a different filename/id
  const duplicate = engine.discoverAsset({
    id: 'photo-duplicate',
    data,
    filename: 'photo_copy.png',
    mimeType: 'image/png',
  });

  assert.equal(duplicate.state, 'BACKED_UP', 'Duplicate content should be instantly deduplicated');
  assert.equal(duplicate.progressPercent, 100);
});

test('SyncEngine: Network policy (Wi-Fi only) and offline handling', async () => {
  const masterKey = generateMasterKey();
  const kek = deriveKEK(masterKey);
  const metadataKey = deriveMetadataKey(masterKey);
  const storage = new RemoteBackupProvider();

  const engine = new SyncEngine({
    kek,
    metadataKey,
    storageProvider: storage,
    networkPolicy: { wifiOnly: true, chargingOnly: false, useMobileData: false, uploadVideos: true },
    deviceEnv: { isOnline: false, isWifi: false, isCharging: false },
  });

  engine.discoverAsset({
    id: 'offline-photo',
    data: Buffer.from('offline test'),
    filename: 'offline.jpg',
    mimeType: 'image/jpeg',
  });

  // Try processing while offline
  const offlineResult = await engine.processItem('offline-photo');
  assert.equal(offlineResult.state, 'PAUSED');
  assert.match(offlineResult.errorMessage || '', /Device is offline/);

  // Come online on cellular with wifiOnly enabled
  engine.deviceEnv.isOnline = true;
  engine.deviceEnv.isWifi = false;
  const cellularResult = await engine.retryItem('offline-photo');
  assert.equal(cellularResult.state, 'PAUSED');
  assert.match(cellularResult.errorMessage || '', /Wi-Fi only enabled/);

  // Connect Wi-Fi
  engine.deviceEnv.isWifi = true;
  const wifiResult = await engine.retryItem('offline-photo');
  assert.equal(wifiResult.state, 'BACKED_UP');
});

test('SyncEngine: Queue persistence and recovery across simulated restarts', async () => {
  const masterKey = generateMasterKey();
  const kek = deriveKEK(masterKey);
  const metadataKey = deriveMetadataKey(masterKey);
  const storage = new RemoteBackupProvider();

  const engine1 = new SyncEngine({
    kek,
    metadataKey,
    storageProvider: storage,
    deviceEnv: { isOnline: false, isWifi: false, isCharging: false },
  });

  engine1.discoverAsset({
    id: 'persist-photo-1',
    data: Buffer.from('persist test data'),
    filename: 'saved.jpg',
    mimeType: 'image/jpeg',
  });

  const stateJson = engine1.exportQueueState();

  // Create fresh instance simulating app restart
  const engine2 = new SyncEngine({
    kek,
    metadataKey,
    storageProvider: storage,
    deviceEnv: { isOnline: true, isWifi: true, isCharging: true },
  });

  engine2.importQueueState(stateJson);
  const rehydrated = engine2.getItem('persist-photo-1');
  assert.ok(rehydrated);
  assert.equal(rehydrated.id, 'persist-photo-1');

  // Can resume and finish sync
  const finished = await engine2.processItem('persist-photo-1');
  assert.equal(finished.state, 'BACKED_UP');
});
