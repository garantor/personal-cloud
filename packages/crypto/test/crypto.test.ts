import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateMasterKey,
  deriveKEK,
  deriveMetadataKey,
  generateFileKey,
  wrapFileKey,
  unwrapFileKey,
  chunkBuffer,
  encryptChunk,
  decryptChunk,
  encryptMetadata,
  decryptMetadata,
  computeSha256,
  splitShamirSecret,
  reconstructShamirSecret
} from '../src/index.js';

test('Crypto: Key hierarchy and key wrapping', () => {
  const masterKey = generateMasterKey();
  assert.equal(masterKey.length, 32);

  const kek = deriveKEK(masterKey);
  const metaKey = deriveMetadataKey(masterKey);
  assert.equal(kek.length, 32);
  assert.equal(metaKey.length, 32);
  assert.notDeepEqual(kek, metaKey, 'KEK and Metadata Key must be distinct');

  const fileKey = generateFileKey();
  assert.equal(fileKey.length, 32);

  const wrapped = wrapFileKey(kek, fileKey);
  assert.ok(wrapped.wrappedKey);
  assert.ok(wrapped.iv);
  assert.ok(wrapped.tag);

  const unwrapped = unwrapFileKey(kek, wrapped);
  assert.deepEqual(unwrapped, fileKey, 'Unwrapped file key must match original');

  // Wrong KEK unwrapping should fail
  const wrongKek = generateMasterKey();
  assert.throws(() => unwrapFileKey(wrongKek, wrapped), /Decryption failed/);
});

test('Crypto: Chunking and chunk encryption/decryption with integrity check', () => {
  const fileKey = generateFileKey();
  const fileId = 'test-file-uuid-1234';

  // 10 MB simulated payload
  const originalData = Buffer.alloc(10 * 1024 * 1024, 0x42);
  const chunks = chunkBuffer(originalData, 4 * 1024 * 1024);
  assert.equal(chunks.length, 3, '10 MB data should be 3 chunks of 4MB, 4MB, 2MB');

  const decryptedChunks: Uint8Array[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const enc = encryptChunk(fileKey, i, chunks[i], fileId);
    assert.equal(enc.chunkIndex, i);
    assert.equal(enc.hash, computeSha256(enc.ciphertext));

    // Tampering test
    const tampered = new Uint8Array(enc.ciphertext);
    tampered[0] ^= 0x01;
    assert.throws(
      () => decryptChunk(fileKey, i, tampered, enc.iv, enc.tag, fileId),
      /Decryption failed/
    );

    // Valid decryption
    const dec = decryptChunk(fileKey, i, enc.ciphertext, enc.iv, enc.tag, fileId);
    assert.deepEqual(Buffer.from(dec), Buffer.from(chunks[i]));
    decryptedChunks.push(dec);
  }

  const reassembled = Buffer.concat(decryptedChunks);
  assert.deepEqual(reassembled, originalData);
});

test('Crypto: Metadata encryption and decryption', () => {
  const masterKey = generateMasterKey();
  const metaKey = deriveMetadataKey(masterKey);

  const metadata = {
    originalFilename: 'sunset_beach.jpg',
    mimeType: 'image/jpeg',
    size: 4500123,
    exif: { camera: 'iPhone 15 Pro', date: '2026-10-06T18:32:00Z' }
  };

  const enc = encryptMetadata(metaKey, metadata);
  const dec = decryptMetadata<typeof metadata>(metaKey, enc.encryptedMetadata, enc.iv, enc.tag);

  assert.deepEqual(dec, metadata);
});

test('Crypto: Shamir 2-of-3 Secret Sharing and Recovery', () => {
  const masterKey = generateMasterKey();
  const shares = splitShamirSecret(masterKey, 3, 2);
  assert.equal(shares.length, 3);

  const [shareA, shareB, shareC] = shares;

  // 2-of-3 combinations
  const recoveredAB = reconstructShamirSecret([shareA, shareB], 2);
  assert.deepEqual(recoveredAB, masterKey, 'Share A + Share B must recover master key');

  const recoveredAC = reconstructShamirSecret([shareA, shareC], 2);
  assert.deepEqual(recoveredAC, masterKey, 'Share A + Share C must recover master key');

  const recoveredBC = reconstructShamirSecret([shareB, shareC], 2);
  assert.deepEqual(recoveredBC, masterKey, 'Share B + Share C must recover master key');

  // Single share must fail threshold requirement
  assert.throws(() => reconstructShamirSecret([shareA], 2), /Insufficient shares/);

  // Corrupted share must fail checksum
  const corruptedShareB = {
    ...shareB,
    data: new Uint8Array(shareB.data)
  };
  corruptedShareB.data[0] ^= 0xff;
  assert.throws(() => reconstructShamirSecret([shareA, corruptedShareB], 2), /checksum mismatch/);
});
