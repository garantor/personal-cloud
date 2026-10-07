import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server.js';
import {
  generateMasterKey,
  deriveKEK,
  deriveMetadataKey,
  generateFileKey,
  wrapFileKey,
  encryptMetadata,
  computeSha256
} from '@personal-cloud/crypto';
import { RecoveryManager } from '@personal-cloud/recovery';

test('API: Complete authenticated workflow with zero-knowledge verification', async () => {
  const app = buildServer();

  // 1. Register User & Primary Device
  const regRes = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email: 'alice@personalcloud.test', deviceName: 'iPhone 15' },
  });
  assert.equal(regRes.statusCode, 201);
  const regData = JSON.parse(regRes.body);
  assert.ok(regData.token);
  assert.ok(regData.user.id);
  assert.ok(regData.device.id);

  const token = regData.token;
  const authHeaders = { authorization: `Bearer ${token}` };

  // 2. Register Desktop Storage Node
  const nodeRes = await app.inject({
    method: 'POST',
    url: '/v1/storage-nodes',
    headers: authHeaders,
    payload: {
      deviceId: regData.device.id,
      allocatedBytes: 500 * 1024 * 1024 * 1024,
    },
  });
  assert.equal(nodeRes.statusCode, 201);
  const nodeData = JSON.parse(nodeRes.body);
  assert.equal(nodeData.allocatedBytes, 500 * 1024 * 1024 * 1024);

  // 3. Configure 2-of-3 Recovery (Share C)
  const masterKey = generateMasterKey();
  const recoverySetup = RecoveryManager.setup(masterKey);
  const recRes = await app.inject({
    method: 'POST',
    url: '/v1/recovery/setup',
    headers: authHeaders,
    payload: { remoteSharePayload: recoverySetup.remoteSharePayload },
  });
  assert.equal(recRes.statusCode, 200);

  // 4. Upload Encrypted File Manifest & Chunks
  const kek = deriveKEK(masterKey);
  const metaKey = deriveMetadataKey(masterKey);
  const fileKey = generateFileKey();
  const wrappedKey = wrapFileKey(kek, fileKey);

  const fileId = 'photo-uuid-101';
  const rawPlaintext = Buffer.from('Ultra secret family photo taken at sunset');
  const encMeta = encryptMetadata(metaKey, { filename: 'sunset.jpg', mimeType: 'image/jpeg' });
  const chunkCiphertext = Buffer.from('encrypted-chunk-0-data-payload');
  const chunkHash = computeSha256(chunkCiphertext);

  // Register Manifest
  const manifestRes = await app.inject({
    method: 'POST',
    url: '/v1/files',
    headers: authHeaders,
    payload: {
      fileId,
      version: 1,
      contentHash: computeSha256(rawPlaintext),
      totalPlaintextSize: rawPlaintext.length,
      totalEncryptedSize: chunkCiphertext.length,
      encryptedMetadata: encMeta.encryptedMetadata,
      metadataIv: encMeta.iv,
      metadataTag: encMeta.tag,
      wrappedFileKey: wrappedKey,
      chunks: [
        { index: 0, hash: chunkHash, size: chunkCiphertext.length, iv: 'iv', tag: 'tag' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });
  assert.equal(manifestRes.statusCode, 201);

  // Upload Chunk
  const chunkRes = await app.inject({
    method: 'POST',
    url: `/v1/uploads/${fileId}/chunks`,
    headers: authHeaders,
    payload: {
      chunkIndex: 0,
      hash: chunkHash,
      dataBase64: chunkCiphertext.toString('base64'),
      iv: 'iv',
      tag: 'tag',
    },
  });
  assert.equal(chunkRes.statusCode, 201);

  // Download Chunk
  const dlRes = await app.inject({
    method: 'GET',
    url: `/v1/downloads/${fileId}/chunks/0`,
    headers: authHeaders,
  });
  assert.equal(dlRes.statusCode, 200);
  const dlData = JSON.parse(dlRes.body);
  assert.equal(dlData.dataBase64, chunkCiphertext.toString('base64'));

  // 5. Verify Zero-Knowledge: Response never contains plaintext
  const filesRes = await app.inject({
    method: 'GET',
    url: '/v1/files',
    headers: authHeaders,
  });
  assert.equal(filesRes.statusCode, 200);
  const filesList = JSON.parse(filesRes.body);
  assert.equal(filesList.length, 1);
  assert.ok(!filesRes.body.includes('sunset.jpg'), 'Plaintext filename must NOT be present on server');
  assert.ok(!filesRes.body.includes('Ultra secret family photo'), 'Plaintext contents must NOT be on server');

  // 6. Device Revocation
  const revokeRes = await app.inject({
    method: 'DELETE',
    url: `/v1/devices/${regData.device.id}`,
    headers: authHeaders,
  });
  assert.equal(revokeRes.statusCode, 200);

  // After revocation, session must be blocked
  const blockedRes = await app.inject({
    method: 'GET',
    url: '/v1/files',
    headers: authHeaders,
  });
  assert.equal(blockedRes.statusCode, 401);
});
