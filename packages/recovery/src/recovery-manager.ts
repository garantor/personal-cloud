import {
  splitShamirSecret,
  reconstructShamirSecret,
  type ShamirShare
} from '@personal-cloud/crypto';
import { formatRecoveryCode, parseRecoveryCode } from './code-format.js';

export interface RecoverySetupResult {
  primaryDeviceShare: ShamirShare; // Share A
  recoveryCode: string;             // Share B formatted for human
  remoteShare: ShamirShare;        // Share C stored on backend
  remoteSharePayload: string;      // Base64 JSON of Share C
}

export interface RecoverAccountParams {
  primaryDeviceShare?: ShamirShare;
  recoveryCode?: string;
  remoteSharePayload?: string;
}

export class RecoveryManager {
  /**
   * Initializes 2-of-3 Shamir recovery configuration.
   */
  static setup(masterKey: Uint8Array): RecoverySetupResult {
    const shares = splitShamirSecret(masterKey, 3, 2);
    const primaryDeviceShare = shares[0]; // Share A
    const userShare = shares[1];          // Share B
    const remoteShare = shares[2];        // Share C

    const recoveryCode = formatRecoveryCode(userShare);
    const remoteSharePayload = Buffer.from(JSON.stringify({
      x: remoteShare.x,
      data: Buffer.from(remoteShare.data).toString('base64'),
      checksum: remoteShare.checksum,
    })).toString('base64');

    return {
      primaryDeviceShare,
      recoveryCode,
      remoteShare,
      remoteSharePayload,
    };
  }

  /**
   * Reconstructs the Master Key given any two valid recovery components.
   */
  static recover(params: RecoverAccountParams): Uint8Array {
    const gatheredShares: ShamirShare[] = [];

    if (params.primaryDeviceShare) {
      gatheredShares.push(params.primaryDeviceShare);
    }

    if (params.recoveryCode) {
      const shareB = parseRecoveryCode(params.recoveryCode);
      gatheredShares.push(shareB);
    }

    if (params.remoteSharePayload) {
      try {
        const json = Buffer.from(params.remoteSharePayload, 'base64').toString('utf8');
        const parsed = JSON.parse(json);
        gatheredShares.push({
          x: parsed.x,
          data: new Uint8Array(Buffer.from(parsed.data, 'base64')),
          checksum: parsed.checksum,
        });
      } catch (err) {
        throw new Error('Failed to parse remote share payload: ' + (err as Error).message);
      }
    }

    if (gatheredShares.length < 2) {
      throw new Error(
        `Insufficient recovery components: provided ${gatheredShares.length}, minimum 2 required. Data remains protected.`
      );
    }

    // Deduplicate by share x coordinate
    const uniqueMap = new Map<number, ShamirShare>();
    for (const s of gatheredShares) {
      uniqueMap.set(s.x, s);
    }

    const uniqueShares = Array.from(uniqueMap.values());
    if (uniqueShares.length < 2) {
      throw new Error('Provided components map to the same share coordinate');
    }

    return reconstructShamirSecret(uniqueShares, 2);
  }
}
