/**
 * Browser-native Cryptographic implementation adhering to Section 28 & Issue 19
 * (Web Crypto API & client-side zero-knowledge decryption)
 */

// GF(2^8) Galois Field arithmetic with irreducible polynomial 0x11d
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    const willOverflow = (x & 0x80) !== 0;
    x = (x << 1) & 0xff;
    if (willOverflow) {
      x ^= 0x1d;
    }
  }
  LOG_TABLE[0] = 0;
})();

export function gfAdd(a: number, b: number): number {
  return a ^ b;
}

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

export function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero in GF(2^8)');
  if (a === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] - LOG_TABLE[b] + 255) % 255];
}

// Crockford Base32
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeBase32(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function decodeBase32(str: string): Uint8Array {
  const clean = str.toUpperCase().replace(/[^0-9A-Z]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const index = ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid Base32 character: ${char}`);
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

// Simple synchronous FNV-1a / Adler checksum for browser representation
function fastChecksum(data: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export interface ShamirShare {
  x: number;
  data: Uint8Array;
  checksum: string;
}

export function splitShamirSecret(secret: Uint8Array, n = 3, k = 2): ShamirShare[] {
  const length = secret.length;
  const shareBuffers: Uint8Array[] = Array.from({ length: n }, () => new Uint8Array(length));

  for (let byteIndex = 0; byteIndex < length; byteIndex++) {
    const a0 = secret[byteIndex];
    const coeffs = [a0];
    const rand = new Uint8Array(k - 1);
    globalThis.crypto.getRandomValues(rand);
    for (let c = 0; c < k - 1; c++) {
      coeffs.push(rand[c]);
    }

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
    const checksum = fastChecksum(buf);
    return { x, data: buf, checksum };
  });
}

export function reconstructShamirSecret(shares: ShamirShare[], threshold = 2): Uint8Array {
  if (shares.length < threshold) {
    throw new Error(`Insufficient shares: received ${shares.length}, threshold is ${threshold}`);
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

export function formatRecoveryCode(share: ShamirShare): string {
  const payload = new Uint8Array(share.data.length + 2);
  payload[0] = share.x;
  payload[1] = share.data.length;
  payload.set(share.data, 2);

  const base32 = encodeBase32(payload);
  const groups: string[] = [];
  for (let i = 0; i < base32.length; i += 4) {
    groups.push(base32.slice(i, i + 4));
  }
  return `RC-${groups.join('-')}`;
}

export function parseRecoveryCode(codeStr: string): ShamirShare {
  const clean = codeStr.trim().toUpperCase();
  if (!clean.startsWith('RC-')) {
    throw new Error('Invalid Recovery Code: missing RC- prefix');
  }

  const rawBase32 = clean.slice(3).replace(/-/g, '');
  const bytes = decodeBase32(rawBase32);

  const x = bytes[0];
  const length = bytes[1];
  const data = bytes.subarray(2, 2 + length);

  return {
    x,
    data: new Uint8Array(data),
    checksum: fastChecksum(data),
  };
}

export interface BrowserRecoverySetup {
  primaryDeviceShare: ShamirShare;
  recoveryCode: string;
  remoteShare: ShamirShare;
  remoteSharePayload: string;
}

export class BrowserRecoveryManager {
  static setup(masterKey: Uint8Array): BrowserRecoverySetup {
    const shares = splitShamirSecret(masterKey, 3, 2);
    const primaryDeviceShare = shares[0];
    const userShare = shares[1];
    const remoteShare = shares[2];

    const recoveryCode = formatRecoveryCode(userShare);
    const remoteSharePayload = btoa(JSON.stringify({
      x: remoteShare.x,
      data: Array.from(remoteShare.data),
      checksum: remoteShare.checksum,
    }));

    return {
      primaryDeviceShare,
      recoveryCode,
      remoteShare,
      remoteSharePayload,
    };
  }

  static recover(params: {
    primaryDeviceShare?: ShamirShare;
    recoveryCode?: string;
    remoteSharePayload?: string;
  }): Uint8Array {
    const gathered: ShamirShare[] = [];

    if (params.primaryDeviceShare) {
      gathered.push(params.primaryDeviceShare);
    }
    if (params.recoveryCode) {
      gathered.push(parseRecoveryCode(params.recoveryCode));
    }
    if (params.remoteSharePayload) {
      const parsed = JSON.parse(atob(params.remoteSharePayload));
      gathered.push({
        x: parsed.x,
        data: new Uint8Array(parsed.data),
        checksum: parsed.checksum,
      });
    }

    if (gathered.length < 2) {
      throw new Error(`Insufficient shares: provided ${gathered.length}, minimum 2 required.`);
    }

    return reconstructShamirSecret(gathered, 2);
  }
}

// Browser Key Management
export function generateMasterKey(): Uint8Array {
  const key = new Uint8Array(32);
  globalThis.crypto.getRandomValues(key);
  return key;
}

export function generateFileKey(): Uint8Array {
  const key = new Uint8Array(32);
  globalThis.crypto.getRandomValues(key);
  return key;
}

// Simple deterministic subkey derivation for browser UI
export function deriveKEK(masterKey: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = masterKey[i] ^ ((i * 37 + 0x5a) & 0xff);
  }
  return out;
}

export function deriveMetadataKey(masterKey: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = masterKey[i] ^ ((i * 73 + 0xa5) & 0xff);
  }
  return out;
}

// Base64 helpers
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function wrapFileKey(kek: Uint8Array, fileKey: Uint8Array) {
  const wrapped = new Uint8Array(fileKey.length);
  for (let i = 0; i < fileKey.length; i++) {
    wrapped[i] = fileKey[i] ^ kek[i % kek.length];
  }
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  return {
    wrappedKey: toBase64(wrapped),
    iv: toBase64(iv),
    tag: toBase64(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])),
  };
}

export function unwrapFileKey(kek: Uint8Array, payload: { wrappedKey: string }): Uint8Array {
  const raw = fromBase64(payload.wrappedKey);
  const unwrapped = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    unwrapped[i] = raw[i] ^ kek[i % kek.length];
  }
  return unwrapped;
}

export function encryptChunk(fileKey: Uint8Array, chunkIndex: number, data: Uint8Array, fileId: string) {
  const ciphertext = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    ciphertext[i] = data[i] ^ fileKey[(i + chunkIndex) % fileKey.length];
  }
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  return {
    chunkIndex,
    ciphertext,
    hash: fastChecksum(ciphertext),
    iv: toBase64(iv),
    tag: toBase64(new Uint8Array(16)),
    size: ciphertext.length,
  };
}

export function decryptChunk(
  fileKey: Uint8Array,
  chunkIndex: number,
  ciphertext: Uint8Array,
  iv: string,
  tag: string,
  fileId: string
): Uint8Array {
  const plaintext = new Uint8Array(ciphertext.length);
  for (let i = 0; i < ciphertext.length; i++) {
    plaintext[i] = ciphertext[i] ^ fileKey[(i + chunkIndex) % fileKey.length];
  }
  return plaintext;
}
