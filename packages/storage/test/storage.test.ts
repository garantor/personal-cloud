import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { computeSha256 } from '@personal-cloud/crypto';
import {
  LocalStorageProvider,
  RemoteBackupProvider,
  DecentralizedStorageAdapter,
  DurabilityTracker
} from '../src/index.js';

test('Storage: LocalStorageProvider chunk store, retrieval, and atomic persistence', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pc-storage-test-'));
  try {
    const provider = new LocalStorageProvider({
      id: 'test-local-node',
      name: 'MacBook Node',
      baseDir: tmpDir,
      allocatedBytes: 1024 * 1024 * 1024, // 1 GB
    });

    const data = Buffer.from('encrypted ciphertext binary blob for chunk 0');
    const hash = computeSha256(data);
    const chunk = {
      chunkId: 'chunk-test-101',
      fileId: 'file-123',
      chunkIndex: 0,
      data: new Uint8Array(data),
      hash,
      size: data.length,
    };

    const receipt = await provider.put(chunk);
    assert.equal(receipt.chunkId, chunk.chunkId);
    assert.equal(receipt.contentHash, hash);
    assert.equal(receipt.bytesWritten, data.length);

    const exists = await provider.exists(chunk.chunkId);
    assert.equal(exists, true);

    const retrieved = await provider.get(chunk.chunkId);
    assert.deepEqual(retrieved.data, chunk.data);
    assert.equal(retrieved.hash, hash);

    const health = await provider.health();
    assert.equal(health.status, 'healthy');
    assert.ok(health.usedBytes >= data.length);

    // Tampered put test
    const tamperedChunk = {
      ...chunk,
      chunkId: 'chunk-tampered',
      hash: 'wrong-hash-should-fail',
    };
    await assert.rejects(
      async () => provider.put(tamperedChunk),
      /Integrity check failed/
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('Storage: DecentralizedStorageAdapter and DurabilityTracker', async () => {
  const decentralized = new DecentralizedStorageAdapter({
    network: 'storj',
    satelliteOrGateway: 'https://us1.storjshare.io',
    bucket: 'personal-vault-backup',
  });

  const data = Buffer.from('encrypted data for decentralized network');
  const hash = computeSha256(data);
  const chunk = {
    chunkId: 'chunk-storj-1',
    fileId: 'file-999',
    chunkIndex: 0,
    data: new Uint8Array(data),
    hash,
    size: data.length,
  };

  const receipt = await decentralized.put(chunk);
  assert.equal(receipt.chunkId, chunk.chunkId);

  const tracker = new DurabilityTracker();
  assert.equal(tracker.getDurabilityState('chunk-storj-1'), 'LOCAL_ONLY');
  assert.equal(tracker.canSafelyPruneLocalCopy('chunk-storj-1'), false);

  // Store on desktop node
  tracker.recordChunkStored('chunk-storj-1', 'desktop-node-macbook');
  assert.equal(tracker.getDurabilityState('chunk-storj-1'), 'SYNCED_TO_DEVICE');
  assert.equal(tracker.canSafelyPruneLocalCopy('chunk-storj-1'), true);

  // Store on decentralized remote
  tracker.recordChunkStored('chunk-storj-1', decentralized.id);
  assert.equal(tracker.getDurabilityState('chunk-storj-1'), 'MULTIPLE_REPLICAS');
});
