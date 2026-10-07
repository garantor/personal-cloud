export interface IdentityRecord {
  userId: string;
  walletAddress: string;
  registeredAt: number;
}

export interface OnChainDevice {
  deviceId: string;
  publicKey: string;
  ownerAddress: string;
  isRevoked: boolean;
  registeredAt: number;
}

export interface StorageContract {
  contractId: string;
  renterAddress: string;
  providerAddress: string;
  allocatedGigabytes: number;
  pricePerGbMonthUsd: number;
  durationMonths: number;
  isActive: boolean;
  createdAt: number;
}

export interface StorageCommitment {
  commitmentId: string;
  fileId: string;
  rootContentHash: string;
  chunkCount: number;
  timestamp: number;
}

export interface MarketplaceOffer {
  providerId: string;
  providerAddress: string;
  availableGigabytes: number;
  pricePerGbMonthUsd: number;
  reputationScore: number; // 0 to 100
  uptimePercent: number;
}

export interface BlockchainAdapter {
  isAvailable(): boolean;
  registerIdentity(userId: string, walletAddress: string): Promise<IdentityRecord>;
  registerDevice(deviceId: string, publicKey: string, ownerAddress: string): Promise<OnChainDevice>;
  createStorageContract(renter: string, provider: string, gb: number, price: number): Promise<StorageContract>;
  recordStorageCommitment(fileId: string, rootHash: string, chunkCount: number): Promise<StorageCommitment>;
  settlePayment(contractId: string, amount: number): Promise<{ txHash: string; settled: boolean }>;
}
