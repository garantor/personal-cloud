import type { MarketplaceOffer, StorageContract } from './types.js';
import { SimulatedBlockchainAdapter } from './adapter.js';

export class StorageMarketplace {
  private offers = new Map<string, MarketplaceOffer>();
  private readonly adapter: SimulatedBlockchainAdapter;

  constructor(adapter?: SimulatedBlockchainAdapter) {
    this.adapter = adapter || new SimulatedBlockchainAdapter();
  }

  onboardProvider(params: {
    providerId: string;
    providerAddress: string;
    availableGigabytes: number;
    pricePerGbMonthUsd?: number;
    bandwidthLimitGbMonth?: number;
  }): MarketplaceOffer {
    const offer: MarketplaceOffer = {
      providerId: params.providerId,
      providerAddress: params.providerAddress,
      availableGigabytes: params.availableGigabytes,
      pricePerGbMonthUsd: params.pricePerGbMonthUsd ?? 0.005, // $0.005 / GB-month
      reputationScore: 98,
      uptimePercent: 99.8,
    };
    this.offers.set(params.providerId, offer);
    return offer;
  }

  getOffers(): MarketplaceOffer[] {
    return Array.from(this.offers.values());
  }

  estimateMonthlyRewards(gigabytes: number, pricePerGbMonthUsd: number = 0.005): number {
    return Number((gigabytes * pricePerGbMonthUsd).toFixed(2));
  }

  async rentCapacity(
    renterAddress: string,
    providerId: string,
    gigabytesToRent: number
  ): Promise<StorageContract> {
    const offer = this.offers.get(providerId);
    if (!offer) throw new Error(`Provider offer ${providerId} not found`);
    if (offer.availableGigabytes < gigabytesToRent) {
      throw new Error(`Insufficient provider capacity: available ${offer.availableGigabytes} GB`);
    }

    offer.availableGigabytes -= gigabytesToRent;
    return this.adapter.createStorageContract(
      renterAddress,
      offer.providerAddress,
      gigabytesToRent,
      offer.pricePerGbMonthUsd
    );
  }
}
