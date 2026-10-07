import { randomBytes, createHash } from 'node:crypto';
import { gfAdd, gfMul, gfDiv } from './gf256.js';

export interface ShamirShare {
  x: number;
  data: Uint8Array;
  checksum: string;
}

/**
 * Splits a secret into n shares with a threshold of k using Shamir Secret Sharing over GF(2^8).
 */
export function splitShamirSecret(secret: Uint8Array, n = 3, k = 2): ShamirShare[] {
  if (k < 2 || k > n || n > 255) {
    throw new Error(`Invalid Shamir parameters: n=${n}, k=${k}`);
  }

  const length = secret.length;
  const shareBuffers: Uint8Array[] = Array.from({ length: n }, () => new Uint8Array(length));

  // Evaluate each byte of the secret
  for (let byteIndex = 0; byteIndex < length; byteIndex++) {
    const a0 = secret[byteIndex];
    // Random coefficients for degree k-1 polynomial
    const coeffs = [a0];
    const rand = randomBytes(k - 1);
    for (let c = 0; c < k - 1; c++) {
      coeffs.push(rand[c]);
    }

    // Evaluate for each share point x = 1, 2, ..., n
    for (let i = 0; i < n; i++) {
      const x = i + 1;
      let y = 0;
      let xPower = 1;
      for (let degree = 0; degree < k; degree++) {
        const term = gfMul(coeffs[degree], xPower);
        y = gfAdd(y, term);
        xPower = gfMul(xPower, x);
      }
      shareBuffers[i][byteIndex] = y;
    }
  }

  return shareBuffers.map((buf, i) => {
    const x = i + 1;
    const checksum = createHash('sha256').update(Buffer.concat([Buffer.from([x]), buf])).digest('hex').slice(0, 8);
    return {
      x,
      data: buf,
      checksum,
    };
  });
}

/**
 * Reconstructs the secret from k or more valid shares using Lagrange interpolation.
 */
export function reconstructShamirSecret(shares: ShamirShare[], threshold = 2): Uint8Array {
  if (shares.length < threshold) {
    throw new Error(`Insufficient shares: received ${shares.length}, threshold is ${threshold}`);
  }

  // Verify unique x coordinates
  const uniqueX = new Set(shares.map(s => s.x));
  if (uniqueX.size !== shares.length) {
    throw new Error('Duplicate share x coordinates detected');
  }

  // Verify share integrity
  for (const share of shares) {
    const expectedChecksum = createHash('sha256')
      .update(Buffer.concat([Buffer.from([share.x]), share.data]))
      .digest('hex')
      .slice(0, 8);
    if (share.checksum !== expectedChecksum) {
      throw new Error(`Corrupted share ${share.x}: checksum mismatch`);
    }
  }

  const subset = shares.slice(0, threshold);
  const length = subset[0].data.length;
  const secret = new Uint8Array(length);

  for (let byteIndex = 0; byteIndex < length; byteIndex++) {
    let recoveredByte = 0;

    for (let j = 0; j < threshold; j++) {
      const xj = subset[j].x;
      const yj = subset[j].data[byteIndex];

      let lagrange = 1;
      for (let m = 0; m < threshold; m++) {
        if (m === j) continue;
        const xm = subset[m].x;
        // In GF(2^8): (0 - xm) / (xj - xm) = xm / (xj ^ xm)
        const num = xm;
        const den = gfAdd(xj, xm);
        const factor = gfDiv(num, den);
        lagrange = gfMul(lagrange, factor);
      }

      recoveredByte = gfAdd(recoveredByte, gfMul(yj, lagrange));
    }

    secret[byteIndex] = recoveredByte;
  }

  return secret;
}
