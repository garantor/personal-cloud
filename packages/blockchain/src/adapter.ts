import { randomUUID } from 'node:crypto';
import type {
  BlockchainAdapter,
  IdentityRecord,
  OnChainDevice,
  StorageContract,
  StorageCommitment
} from './types.js';

export class SimulatedBlockchainAdapter implements BlockchainAdapter {
  private online: boolean = true;
  private identities = new Map<string, IdentityRecord>();
  private devices = new Map<string, OnChainDevice>();
  private contracts = new Map<string, StorageContract>();
  private commitments = new Map<string, StorageCommitment>();

  setOnline(status: boolean): void {
    this.online = status;
  }

  isAvailable(): boolean {
    return this.online;
  }

  async registerIdentity(userId: string, walletAddress: string): Promise<IdentityRecord> {
    if (!this.online) throw new Error('Blockchain network unreachable (offline fallback active)');
    const record: IdentityRecord = {
      userId,
      walletAddress,
      registeredAt: Date.now(),
    };
    this.identities.set(userId, record);
    return record;
  }

  async registerDevice(deviceId: string, publicKey: string, ownerAddress: string): Promise<OnChainDevice> {
    if (!this.online) throw new Error('Blockchain network unreachable (offline fallback active)');
    const device: OnChainDevice = {
      deviceId,
      publicKey,
      ownerAddress,
      isRevoked: false,
      registeredAt: Date.now(),
    };
    this.devices.set(deviceId, device);
    return device;
  }

  async createStorageContract(
    renter: string,
    provider: string,
    allocatedGigabytes: number,
    pricePerGbMonthUsd: number
  ): Promise<StorageContract> {
    if (!this.online) throw new Error('Blockchain network unreachable (offline fallback active)');
    const contract: StorageContract = {
      contractId: `contract-${randomUUID().slice(0, 8)}`,
      renterAddress: renter,
      providerAddress: provider,
      allocatedGigabytes,
      pricePerGbMonthUsd,
      durationMonths: 12,
      isActive: true,
      createdAt: Date.now(),
    };
    this.contracts.set(contract.contractId, contract);
    return contract;
  }

  async recordStorageCommitment(
    fileId: string,
    rootContentHash: string,
    chunkCount: number
  ): Promise<StorageCommitment> {
    if (!this.online) throw new Error('Blockchain network unreachable (offline fallback active)');
    const commitment: StorageCommitment = {
      commitmentId: `commit-${randomUUID().slice(0, 8)}`,
      fileId,
      rootContentHash,
      chunkCount,
      timestamp: Date.now(),
    };
    this.commitments.set(commitment.commitmentId, commitment);
    return commitment;
  }

  async settlePayment(contractId: string, amount: number): Promise<{ txHash: string; settled: boolean }> {
    if (!this.online) throw new Error('Blockchain network unreachable (offline fallback active)');
    const contract = this.contracts.get(contractId);
    if (!contract) throw new Error(`Contract ${contractId} not found`);

    return {
      txHash: `0x${randomUUID().replace(/-/g, '')}`,
      settled: true,
    };
  }
}
