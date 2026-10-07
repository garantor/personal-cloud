import test from 'node:test';
import assert from 'node:assert/strict';
import { RemoteBackupProvider } from '@personal-cloud/storage';
import { MobileClient } from '../src/index.js';

test('Mobile: Photo taking automatically queues, encrypts, and backs up', async () => {
  const storage = new RemoteBackupProvider();
  const client = new MobileClient({
    deviceId: 'iphone-15-pro',
    userId: 'user-bob',
    storageProvider: storage,
  });

  const recovery = client.initRecovery();
  assert.ok(recovery.recoveryCode.startsWith('RC-'));

  const photoBytes = Buffer.from('RAW camera sensor data for IMG_2026.heic');
  const result = await client.takePhoto({
    id: 'asset-img-2026',
    filename: 'IMG_2026.heic',
    data: photoBytes,
    mimeType: 'image/heic',
  });

  assert.equal(result.state, 'BACKED_UP');
  assert.equal(result.progressPercent, 100);
  assert.match(client.getStatusSummary(), /✓ 1 photos backed up/);
});

test('Mobile: Offline photo capture queues and resumes when reconnected', async () => {
  const storage = new RemoteBackupProvider();
  const client = new MobileClient({
    deviceId: 'iphone-15-pro',
    userId: 'user-bob',
    storageProvider: storage,
    deviceEnv: { isOnline: false, isWifi: false, isCharging: false },
  });

  const photoBytes = Buffer.from('Offline vacation snapshot');
  const result = await client.takePhoto({
    id: 'offline-snap-1',
    filename: 'snapshot.jpg',
    data: photoBytes,
  });

  assert.equal(result.state, 'PAUSED');

  // Network restored
  client.syncEngine.deviceEnv.isOnline = true;
  client.syncEngine.deviceEnv.isWifi = true;
  const resumed = await client.syncEngine.retryItem('offline-snap-1');
  assert.equal(resumed.state, 'BACKED_UP');
});
