import type { ShamirShare } from '@personal-cloud/crypto';
import { createHash } from 'node:crypto';

// Crockford-style Base32 alphabet (no I, L, O, U to avoid human transcription confusion)
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

/**
 * Formats a Shamir share into a human-friendly Recovery Code with embedded checksum:
 * e.g. RC-7X9B-K4M2-99FA-W103-88ZP-Q994
 */
export function formatRecoveryCode(share: ShamirShare): string {
  const checksumBuf = Buffer.from(share.checksum.slice(0, 8), 'hex'); // 4 bytes

  // Payload: [x (1 byte)] + [data length (1 byte)] + [checksum (4 bytes)] + [data (N bytes)]
  const payload = Buffer.concat([
    Buffer.from([share.x, share.data.length]),
    checksumBuf,
    Buffer.from(share.data),
  ]);

  const base32 = encodeBase32(payload);
  const groups: string[] = [];
  for (let i = 0; i < base32.length; i += 4) {
    groups.push(base32.slice(i, i + 4));
  }

  return `RC-${groups.join('-')}`;
}

/**
 * Parses a human-friendly Recovery Code back into a ShamirShare and validates integrity.
 */
export function parseRecoveryCode(codeStr: string): ShamirShare {
  const clean = codeStr.trim().toUpperCase();
  if (!clean.startsWith('RC-')) {
    throw new Error('Invalid Recovery Code: missing RC- prefix');
  }

  const rawBase32 = clean.slice(3).replace(/-/g, '');
  const bytes = decodeBase32(rawBase32);

  if (bytes.length < 6) {
    throw new Error('Invalid Recovery Code: payload too short');
  }

  const x = bytes[0];
  const length = bytes[1];
  const storedChecksum = Buffer.from(bytes.subarray(2, 6)).toString('hex');
  const data = bytes.subarray(6, 6 + length);

  if (data.length !== length) {
    throw new Error('Invalid Recovery Code: corrupt payload length');
  }

  const calculatedChecksum = createHash('sha256')
    .update(Buffer.concat([Buffer.from([x]), data]))
    .digest('hex')
    .slice(0, 8);

  if (storedChecksum !== calculatedChecksum) {
    throw new Error(`Recovery code corrupted: checksum mismatch (expected ${calculatedChecksum}, got ${storedChecksum})`);
  }

  return {
    x,
    data: new Uint8Array(data),
    checksum: calculatedChecksum,
  };
}
