import { randomBytes, hkdfSync } from 'node:crypto';
import { encryptAesGcm, decryptAesGcm } from './cipher.js';

export interface WrappedKeyPayload {
  wrappedKey: string; // base64
  iv: string; // base64
  tag: string; // base64
}

/**
 * Generates a 256-bit Master Key using CSPRNG.
 */
export function generateMasterKey(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

/**
 * Derives a 256-bit Key Encryption Key (KEK) from the Master Key via HKDF-SHA-256.
 */
export function deriveKEK(masterKey: Uint8Array): Uint8Array {
  const kekBuffer = hkdfSync('sha256', Buffer.from(masterKey), 'personal-cloud-kek-salt', 'KEK-v1', 32);
  return new Uint8Array(kekBuffer);
}

/**
 * Derives a 256-bit Metadata Encryption Key from the Master Key via HKDF-SHA-256.
 */
export function deriveMetadataKey(masterKey: Uint8Array): Uint8Array {
  const metaBuffer = hkdfSync('sha256', Buffer.from(masterKey), 'personal-cloud-meta-salt', 'META-v1', 32);
  return new Uint8Array(metaBuffer);
}

/**
 * Generates a fresh random 256-bit File Key.
 */
export function generateFileKey(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

/**
 * Wraps a File Key using AES-256-GCM under the user's KEK.
 */
export function wrapFileKey(kek: Uint8Array, fileKey: Uint8Array): WrappedKeyPayload {
  const result = encryptAesGcm(kek, fileKey, Buffer.from('file-key-wrap'));
  return {
    wrappedKey: Buffer.from(result.ciphertext).toString('base64'),
    iv: Buffer.from(result.iv).toString('base64'),
    tag: Buffer.from(result.tag).toString('base64'),
  };
}

/**
 * Unwraps a wrapped File Key using the user's KEK.
 */
export function unwrapFileKey(kek: Uint8Array, payload: WrappedKeyPayload): Uint8Array {
  const ciphertext = Buffer.from(payload.wrappedKey, 'base64');
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  return decryptAesGcm(kek, ciphertext, iv, tag, Buffer.from('file-key-wrap'));
}
