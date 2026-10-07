import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMasterKey, deriveKEK, deriveMetadataKey } from '@personal-cloud/crypto';
import { createEncryptedFile, decryptFileFromManifest } from '../src/index.js';

test('FileManifest: Create encrypted file with chunks and decrypt successfully', () => {
  const masterKey = generateMasterKey();
  const kek = deriveKEK(masterKey);
  const metadataKey = deriveMetadataKey(masterKey);

  const fileId = 'photo-uuid-9988';
  const originalBytes = Buffer.from('Hello, this is a secret personal photo raw binary stream repeated '.repeat(1000));
  const metadata = {
    filename: 'vacation.heic',
    mimeType: 'image/heic',
    folder: 'Vacations/2026',
    createdAt: new Date().toISOString(),
  };

  const { manifest, encryptedChunks } = createEncryptedFile({
    fileId,
    data: originalBytes,
    metadata,
    kek,
    metadataKey,
    chunkSize: 16 * 1024, // 16 KB chunks for test
  });

  assert.equal(manifest.fileId, fileId);
  assert.equal(manifest.totalPlaintextSize, originalBytes.length);
  assert.ok(manifest.chunks.length > 1);

  // Decrypt
  const result = decryptFileFromManifest(
    manifest,
    encryptedChunks.map(c => ({ index: c.index, data: c.data })),
    kek,
    metadataKey
  );

  assert.deepEqual(Buffer.from(result.data), originalBytes);
  assert.equal(result.metadata.filename, 'vacation.heic');
  assert.equal(result.metadata.mimeType, 'image/heic');
});

test('FileManifest: Tampered chunk hash causes decryption error', () => {
  const masterKey = generateMasterKey();
  const kek = deriveKEK(masterKey);
  const metadataKey = deriveMetadataKey(masterKey);

  const fileId = 'file-tamper-check';
  const originalBytes = Buffer.from('Critical private backup data');
  const metadata = {
    filename: 'passwords.txt',
    mimeType: 'text/plain',
    createdAt: new Date().toISOString(),
  };

  const { manifest, encryptedChunks } = createEncryptedFile({
    fileId,
    data: originalBytes,
    metadata,
    kek,
    metadataKey,
  });

  // Tamper first chunk
  const tamperedChunks = encryptedChunks.map(c => ({
    index: c.index,
    data: new Uint8Array(c.data)
  }));
  tamperedChunks[0].data[0] ^= 0xff;

  assert.throws(
    () => decryptFileFromManifest(manifest, tamperedChunks, kek, metadataKey),
    /Chunk 0 hash mismatch/
  );
});
