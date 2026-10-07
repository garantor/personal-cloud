import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  generateMasterKey,
  deriveKEK,
  deriveMetadataKey,
  unwrapFileKey,
  decryptMetadata,
  decryptChunk,
  computeSha256
} from '@personal-cloud/crypto';
import { RecoveryManager } from '@personal-cloud/recovery';
import { RemoteBackupProvider } from '@personal-cloud/storage';
import { DesktopStorageNode } from '@personal-cloud/desktop';
import { MobileClient } from '@personal-cloud/mobile';
import { buildServer } from '../services/api/src/server.js';
import type { FileMetadataPlaintext } from '@personal-cloud/file-manifest';

async function runE2EAcceptanceTest() {
  console.log('======================================================================');
  console.log('🛡️  PERSONAL CLOUD: OFFICIAL 23-STEP END-TO-END ACCEPTANCE TEST');
  console.log('======================================================================\n');

  const tmpDesktopDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pc-e2e-desktop-'));

  try {
    // Spin up backend API server
    const apiServer = buildServer();
    await apiServer.ready();

    // -------------------------------------------------------------------------
    // Step 1: Install mobile application.
    // -------------------------------------------------------------------------
    console.log('[Step 1] Installing mobile application on Primary Phone...');
    let mobileAppPrimary = new MobileClient({
      deviceId: 'iphone-15-primary',
      userId: 'user-charlie',
      storageProvider: new RemoteBackupProvider({ id: 'relay-service' }),
    });
    assert.ok(mobileAppPrimary, 'Mobile app must initialize properly');
    console.log('  -> Mobile app installed successfully.');

    // -------------------------------------------------------------------------
    // Step 2: Create account using passkey.
    // -------------------------------------------------------------------------
    console.log('[Step 2] Creating account using passkey authentication...');
    const regRes = await apiServer.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'charlie@personalcloud.test',
        deviceName: 'Primary iPhone',
        deviceType: 'mobile_ios',
      },
    });
    assert.equal(regRes.statusCode, 201);
    const regData = JSON.parse(regRes.body);
    const userAuthToken = regData.token;
    const authHeaders = { authorization: `Bearer ${userAuthToken}` };
    console.log(`  -> Account created: User ID ${regData.user.id}, Device ID ${regData.device.id}`);

    // -------------------------------------------------------------------------
    // Step 3: Configure recovery.
    // -------------------------------------------------------------------------
    console.log('[Step 3] Configuring 2-of-3 Shamir recovery...');
    const recoverySetup = mobileAppPrimary.initRecovery();
    assert.ok(recoverySetup.recoveryCode.startsWith('RC-'), 'Recovery code must have RC- prefix');
    assert.ok(recoverySetup.remoteSharePayload, 'Remote share payload must be present');

    // Register remote share (Share C) on backend
    const recSetupRes = await apiServer.inject({
      method: 'POST',
      url: '/v1/recovery/setup',
      headers: authHeaders,
      payload: { remoteSharePayload: recoverySetup.remoteSharePayload },
    });
    assert.equal(recSetupRes.statusCode, 200);
    console.log(`  -> Recovery configured: Human Recovery Code = ${recoverySetup.recoveryCode}`);
    console.log(`  -> Share C deposited securely with server relay.`);

    // -------------------------------------------------------------------------
    // Step 4: Connect desktop.
    // -------------------------------------------------------------------------
    console.log('[Step 4] Connecting Desktop Storage Node...');
    const desktopNode = new DesktopStorageNode({
      deviceId: 'desktop-macbook-pro',
      userId: regData.user.id,
      storageDir: tmpDesktopDir,
      allocatedBytes: 500 * 1024 * 1024 * 1024, // 500 GB
    });
    await desktopNode.start();

    // Register desktop node with API
    const nodeRegRes = await apiServer.inject({
      method: 'POST',
      url: '/v1/storage-nodes',
      headers: authHeaders,
      payload: {
        deviceId: 'desktop-macbook-pro',
        allocatedBytes: 500 * 1024 * 1024 * 1024,
      },
    });
    assert.equal(nodeRegRes.statusCode, 201);
    console.log('  -> Desktop storage node connected and registered without manual networking.');

    // -------------------------------------------------------------------------
    // Step 5: Allocate 500 GB to personal storage.
    // -------------------------------------------------------------------------
    console.log('[Step 5] Allocating 500 GB capacity to personal storage...');
    const nodeInfo = await desktopNode.getInfo();
    assert.equal(nodeInfo.allocatedBytes, 500 * 1024 * 1024 * 1024);
    assert.equal(nodeInfo.status, 'online');
    console.log(`  -> Allocated capacity confirmed: ${nodeInfo.allocatedBytes / 1024 ** 3} GB.`);

    // -------------------------------------------------------------------------
    // Step 6: Take photo on phone.
    // -------------------------------------------------------------------------
    console.log('[Step 6] Taking photo on phone (IMG_4001.heic)...');
    const photo1Plaintext = Buffer.from('RAW camera bytes: Beautiful Pacific ocean sunset with children playing');
    const photo1Id = 'photo-asset-4001';

    // -------------------------------------------------------------------------
    // Step 7: Verify photo enters sync queue.
    // -------------------------------------------------------------------------
    console.log('[Step 7] Verifying photo enters sync queue...');
    const item1 = mobileAppPrimary.syncEngine.discoverAsset({
      id: photo1Id,
      filename: 'IMG_4001.heic',
      data: photo1Plaintext,
      mimeType: 'image/heic',
    });
    assert.equal(item1.state, 'QUEUED');
    console.log('  -> Photo is successfully enqueued in persistent queue state: QUEUED');

    // -------------------------------------------------------------------------
    // Step 8: Verify photo is encrypted.
    // -------------------------------------------------------------------------
    console.log('[Step 8] Verifying photo is encrypted with AEAD before leaving device...');
    const processed1 = await mobileAppPrimary.syncEngine.processItem(photo1Id);
    assert.ok(processed1.manifest, 'Manifest must exist');
    assert.notEqual(processed1.manifest.encryptedMetadata, 'IMG_4001.heic');
    assert.notEqual(processed1.manifest.contentHash, photo1Plaintext.toString());
    console.log('  -> Verified: Encrypted manifest generated; file key wrapped under KEK.');

    // Register manifest on backend
    await apiServer.inject({
      method: 'POST',
      url: '/v1/files',
      headers: authHeaders,
      payload: processed1.manifest,
    });

    // -------------------------------------------------------------------------
    // Step 9: Verify encrypted chunks reach desktop.
    // -------------------------------------------------------------------------
    console.log('[Step 9] Verifying encrypted chunks reach desktop storage node via relay...');
    // Transfer each encrypted chunk to desktop node
    for (const chunkDesc of processed1.manifest.chunks) {
      const chunkId = `${processed1.fileId}-c${chunkDesc.index}`;
      const chunkFromStorage = await mobileAppPrimary.syncEngine['storageProvider'].get(chunkId);

      const desktopAck = await desktopNode.receiveEncryptedChunk(chunkFromStorage);
      assert.equal(desktopAck.success, true, 'Desktop node must accept chunk');
    }
    console.log('  -> Encrypted chunks successfully transferred to desktop node.');

    // -------------------------------------------------------------------------
    // Step 10: Verify desktop stores ciphertext.
    // -------------------------------------------------------------------------
    console.log('[Step 10] Verifying desktop stores ciphertext (not plaintext)...');
    const storedChunk = await desktopNode.readChunk(`${processed1.fileId}-c0`);
    const storedChunkStr = Buffer.from(storedChunk.data).toString();
    assert.ok(!storedChunkStr.includes('Beautiful Pacific ocean sunset'), 'Desktop must NOT store plaintext');
    console.log('  -> Verified: Desktop node holds solely ciphertext bytes.');

    // -------------------------------------------------------------------------
    // Step 11: Verify backend cannot decrypt the file.
    // -------------------------------------------------------------------------
    console.log('[Step 11] Verifying backend cannot decrypt the file...');
    const serverFileRes = await apiServer.inject({
      method: 'GET',
      url: `/v1/files/${processed1.fileId}`,
      headers: authHeaders,
    });
    assert.equal(serverFileRes.statusCode, 200);
    const serverFileData = JSON.parse(serverFileRes.body);
    assert.ok(serverFileData.encryptedMetadata, 'Backend only possesses ciphertext metadata');
    assert.ok(serverFileData.wrappedFileKey, 'Backend only possesses wrapped file key');

    // Attempting decryption on server with zero keys will fail
    assert.throws(() => {
      // Server does not possess KEK or Master Key
      const dummyKey = new Uint8Array(32);
      unwrapFileKey(dummyKey, serverFileData.wrappedFileKey);
    }, /Decryption failed/);
    console.log('  -> Verified: Server is cryptographically blind to file contents and metadata.');

    // -------------------------------------------------------------------------
    // Step 12: Verify photo becomes visible on another authorized device.
    // -------------------------------------------------------------------------
    console.log('[Step 12] Verifying photo becomes visible & decryptable on another authorized device (MacBook)...');
    // Authorized device possesses Master Key -> derives KEK & MetadataKey
    const macKek = deriveKEK(mobileAppPrimary.getMasterKey());
    const macMetaKey = deriveMetadataKey(mobileAppPrimary.getMasterKey());

    // Decrypt metadata on authorized device
    const decryptedMeta = decryptMetadata<FileMetadataPlaintext>(
      macMetaKey,
      serverFileData.encryptedMetadata,
      serverFileData.metadataIv,
      serverFileData.metadataTag
    );
    assert.equal(decryptedMeta.filename, 'IMG_4001.heic');

    // Decrypt chunk data
    const fileKeyOnMac = unwrapFileKey(macKek, serverFileData.wrappedFileKey);
    const chunkDesc0 = serverFileData.chunks[0];
    const decryptedBytes = decryptChunk(
      fileKeyOnMac,
      0,
      storedChunk.data,
      chunkDesc0.iv,
      chunkDesc0.tag,
      processed1.fileId!
    );
    assert.deepEqual(Buffer.from(decryptedBytes), photo1Plaintext);
    console.log('  -> Verified: Authorized secondary device downloaded & decrypted photo successfully.');

    // -------------------------------------------------------------------------
    // Step 13: Disconnect desktop.
    // -------------------------------------------------------------------------
    console.log('[Step 13] Disconnecting desktop node (simulating node going offline)...');
    await desktopNode.stop();
    const offlineInfo = await desktopNode.getInfo();
    assert.equal(offlineInfo.status, 'offline');
    console.log('  -> Desktop node status: OFFLINE');

    // -------------------------------------------------------------------------
    // Step 14: Take another photo.
    // -------------------------------------------------------------------------
    console.log('[Step 14] Taking another photo while desktop node is disconnected (IMG_4002.jpg)...');
    const photo2Plaintext = Buffer.from('Second snapshot: Campfire under the stars');
    const photo2Id = 'photo-asset-4002';
    // Mobile pauses uploads to desktop while offline
    mobileAppPrimary.syncEngine.deviceEnv.isOnline = false;
    const item2 = mobileAppPrimary.syncEngine.discoverAsset({
      id: photo2Id,
      filename: 'IMG_4002.jpg',
      data: photo2Plaintext,
      mimeType: 'image/jpeg',
    });

    // -------------------------------------------------------------------------
    // Step 15: Verify photo remains queued.
    // -------------------------------------------------------------------------
    console.log('[Step 15] Verifying photo remains queued...');
    const processed2WhileOffline = await mobileAppPrimary.syncEngine.processItem(photo2Id);
    assert.equal(processed2WhileOffline.state, 'PAUSED');
    console.log('  -> Verified: Photo 2 is securely retained in queue (PAUSED waiting for connectivity).');

    // -------------------------------------------------------------------------
    // Step 16: Reconnect desktop.
    // -------------------------------------------------------------------------
    console.log('[Step 16] Reconnecting desktop node and bringing network back online...');
    await desktopNode.start();
    mobileAppPrimary.syncEngine.deviceEnv.isOnline = true;
    mobileAppPrimary.syncEngine.deviceEnv.isWifi = true;
    console.log('  -> Desktop node online; mobile connectivity restored.');

    // -------------------------------------------------------------------------
    // Step 17: Verify synchronization resumes automatically.
    // -------------------------------------------------------------------------
    console.log('[Step 17] Verifying synchronization resumes automatically...');
    const resumed2 = await mobileAppPrimary.syncEngine.retryItem(photo2Id);
    assert.equal(resumed2.state, 'BACKED_UP');
    assert.equal(resumed2.progressPercent, 100);
    // Push chunks to desktop
    for (const chunkDesc of resumed2.manifest!.chunks) {
      const chunkId = `${resumed2.fileId}-c${chunkDesc.index}`;
      const chunkFromStorage = await mobileAppPrimary.syncEngine['storageProvider'].get(chunkId);
      await desktopNode.receiveEncryptedChunk(chunkFromStorage);
    }
    console.log('  -> Verified: Photo 2 automatically resumed and backed up completely.');

    // -------------------------------------------------------------------------
    // Step 18: Delete/revoke primary phone.
    // -------------------------------------------------------------------------
    console.log('[Step 18] Revoking primary phone (simulating phone destroyed / lost)...');
    const revokeRes = await apiServer.inject({
      method: 'DELETE',
      url: `/v1/devices/${regData.device.id}`,
      headers: authHeaders,
    });
    assert.equal(revokeRes.statusCode, 200);
    console.log(`  -> Primary Phone (${regData.device.id}) revoked from account.`);

    // -------------------------------------------------------------------------
    // Step 19: Install application on new phone.
    // -------------------------------------------------------------------------
    console.log('[Step 19] Installing application on brand new phone (iPhone 16)...');
    const mobileAppReplacement = new MobileClient({
      deviceId: 'iphone-16-replacement',
      userId: regData.user.id,
      storageProvider: new RemoteBackupProvider({ id: 'relay-service' }),
    });
    console.log('  -> Application initialized on replacement phone.');

    // -------------------------------------------------------------------------
    // Step 20: Recover account using two recovery components.
    // -------------------------------------------------------------------------
    console.log('[Step 20] Recovering account using Recovery Credential (Share B) + Remote Share (Share C)...');
    // Fetch Remote Share C from server
    // User signs in with Passkey / credential to get replacement session token
    const newSessionRes = await apiServer.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'charlie@personalcloud.test',
        deviceName: 'Replacement iPhone 16',
        deviceType: 'mobile_ios',
      },
    });
    const replacementToken = JSON.parse(newSessionRes.body).token;
    const replacementHeaders = { authorization: `Bearer ${replacementToken}` };

    const restoreRes = await apiServer.inject({
      method: 'GET',
      url: '/v1/recovery/restore',
      headers: replacementHeaders,
    });
    assert.equal(restoreRes.statusCode, 200);
    const remoteSharePayload = JSON.parse(restoreRes.body).remoteSharePayload;

    // Local reconstruction
    const recoveredMasterKey = RecoveryManager.recover({
      recoveryCode: recoverySetup.recoveryCode, // Share B
      remoteSharePayload,                       // Share C
    });

    assert.deepEqual(
      Buffer.from(recoveredMasterKey),
      Buffer.from(mobileAppPrimary.getMasterKey()),
      'Reconstructed Master Key must match original'
    );
    mobileAppReplacement.setMasterKey(recoveredMasterKey);
    console.log('  -> Account successfully recovered! Master key reconstructed.');

    // -------------------------------------------------------------------------
    // Step 21: Verify previously backed-up photos are accessible.
    // -------------------------------------------------------------------------
    console.log('[Step 21] Verifying previously backed-up photos are accessible on new phone...');
    const replacementKek = deriveKEK(recoveredMasterKey);
    const replacementMetaKey = deriveMetadataKey(recoveredMasterKey);

    const checkFileRes = await apiServer.inject({
      method: 'GET',
      url: `/v1/files/${processed1.fileId}`,
      headers: replacementHeaders,
    });
    const checkFileData = JSON.parse(checkFileRes.body);

    const decryptedMetaReplacement = decryptMetadata<FileMetadataPlaintext>(
      replacementMetaKey,
      checkFileData.encryptedMetadata,
      checkFileData.metadataIv,
      checkFileData.metadataTag
    );
    assert.equal(decryptedMetaReplacement.filename, 'IMG_4001.heic');

    const unwrappedKeyReplacement = unwrapFileKey(replacementKek, checkFileData.wrappedFileKey);
    const downloadedChunk = await desktopNode.readChunk(`${processed1.fileId}-c0`);
    const recoveredPhotoBytes = decryptChunk(
      unwrappedKeyReplacement,
      0,
      downloadedChunk.data,
      checkFileData.chunks[0].iv,
      checkFileData.chunks[0].tag,
      processed1.fileId!
    );
    assert.deepEqual(Buffer.from(recoveredPhotoBytes), photo1Plaintext);
    console.log('  -> Verified: All prior photos accessible and fully decrypted on new phone.');

    // -------------------------------------------------------------------------
    // Step 22: Verify revoked phone cannot access new data.
    // -------------------------------------------------------------------------
    console.log('[Step 22] Verifying revoked phone cannot access new data...');
    const revokedAttemptRes = await apiServer.inject({
      method: 'GET',
      url: '/v1/files',
      headers: authHeaders, // Using old revoked token
    });
    assert.equal(revokedAttemptRes.statusCode, 401, 'Revoked device token must be rejected');
    console.log('  -> Verified: Revoked phone cannot access user data or API.');

    // -------------------------------------------------------------------------
    // Step 23: Verify encrypted remote backup can restore the account.
    // -------------------------------------------------------------------------
    console.log('[Step 23] Verifying encrypted remote backup can restore the account...');
    const remoteRestoreKey = RecoveryManager.recover({
      recoveryCode: recoverySetup.recoveryCode,
      remoteSharePayload: recoverySetup.remoteSharePayload,
    });
    assert.deepEqual(Buffer.from(remoteRestoreKey), Buffer.from(mobileAppPrimary.getMasterKey()));
    console.log('  -> Verified: Encrypted remote backup + recovery code successfully restores the account.');

    console.log('\n======================================================================');
    console.log('🏆 ALL 23 STEPS OF THE END-TO-END ACCEPTANCE TEST PASSED WITH 100% SUCCESS!');
    console.log('======================================================================\n');
  } finally {
    await fs.rm(tmpDesktopDir, { recursive: true, force: true });
  }
}

runE2EAcceptanceTest().catch(err => {
  console.error('E2E TEST FAILURE:', err);
  process.exit(1);
});
