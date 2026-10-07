import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { computeSha256 } from '@personal-cloud/crypto';
import { DesktopStorageNode } from '../src/index.js';

test('Desktop: Start, allocate 500GB, receive encrypted chunk, verify integrity & health', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pc-desktop-test-'));
  try {
    const node = new DesktopStorageNode({
      deviceId: 'desktop-mac-test',
      userId: 'user-alice',
      storageDir: tmpDir,
      allocatedBytes: 500 * 1024 * 1024 * 1024,
    });

    await node.start();
    const info = await node.getInfo();
    assert.equal(info.status, 'online');
    assert.equal(info.allocatedBytes, 500 * 1024 * 1024 * 1024);

    const chunkData = Buffer.from('Encrypted chunk ciphertext for photo 1');
    const hash = computeSha256(chunkData);

    // Receive chunk
    const ack = await node.receiveEncryptedChunk({
      chunkId: 'file-1-c0',
      fileId: 'file-1',
      chunkIndex: 0,
      data: new Uint8Array(chunkData),
      hash,
      size: chunkData.length,
    });

    assert.equal(ack.success, true);
    assert.equal(await node.hasChunk('file-1-c0'), true);

    const chunk = await node.readChunk('file-1-c0');
    assert.deepEqual(chunk.data, new Uint8Array(chunkData));

    // Tampered chunk rejection
    const tamperedAck = await node.receiveEncryptedChunk({
      chunkId: 'file-1-c1',
      fileId: 'file-1',
      chunkIndex: 1,
      data: new Uint8Array(chunkData),
      hash: 'tampered-hash-fails',
      size: chunkData.length,
    });
    assert.equal(tamperedAck.success, false);
    assert.match(tamperedAck.error || '', /Integrity check failed/);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
