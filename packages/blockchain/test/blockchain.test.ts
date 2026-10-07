import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulatedBlockchainAdapter, StorageMarketplace } from '../src/index.js';

test('Blockchain: Identity, device registration and storage contracts', async () => {
  const adapter = new SimulatedBlockchainAdapter();

  const idRec = await adapter.registerIdentity('user-1', '0x1111222233334444555566667777888899990000');
  assert.equal(idRec.userId, 'user-1');

  const devRec = await adapter.registerDevice('device-1', 'pubkey-abc', idRec.walletAddress);
  assert.equal(devRec.deviceId, 'device-1');

  const contract = await adapter.createStorageContract('0xRenter', '0xProvider', 500, 0.005);
  assert.equal(contract.allocatedGigabytes, 500);
  assert.equal(contract.isActive, true);

  const commit = await adapter.recordStorageCommitment('file-123', 'content-sha256', 4);
  assert.equal(commit.fileId, 'file-123');
  assert.equal(commit.chunkCount, 4);

  const payment = await adapter.settlePayment(contract.contractId, 2.5);
  assert.ok(payment.settled);
  assert.ok(payment.txHash.startsWith('0x'));
});

test('Blockchain: Graceful offline fallback', async () => {
  const adapter = new SimulatedBlockchainAdapter();
  adapter.setOnline(false);

  assert.equal(adapter.isAvailable(), false);
  await assert.rejects(
    async () => adapter.registerIdentity('user-offline', '0x123'),
    /offline fallback active/
  );
});

test('Blockchain: Storage Marketplace renting and reward estimation', async () => {
  const marketplace = new StorageMarketplace();
  const offer = marketplace.onboardProvider({
    providerId: 'macbook-node-01',
    providerAddress: '0xProviderNode',
    availableGigabytes: 400,
    pricePerGbMonthUsd: 0.005,
  });

  assert.equal(offer.availableGigabytes, 400);

  const estimatedReward = marketplace.estimateMonthlyRewards(400, 0.005);
  assert.equal(estimatedReward, 2.0); // $2.00 / month

  const contract = await marketplace.rentCapacity('0xRenterUser', 'macbook-node-01', 100);
  assert.equal(contract.allocatedGigabytes, 100);
  assert.equal(offer.availableGigabytes, 300); // 300 GB left
});
