import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

export interface EncryptedDataResult {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  tag: Uint8Array;
}

export interface EncryptedChunkResult {
  chunkIndex: number;
  ciphertext: Uint8Array;
  hash: string;
  iv: string; // base64
  tag: string; // base64
  size: number;
}

export function computeSha256(data: Uint8Array | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Standard AES-256-GCM encryption with 12-byte IV and 16-byte authentication tag.
 */
export function encryptAesGcm(
  key: Uint8Array,
  plaintext: Uint8Array,
  associatedData?: Uint8Array | Buffer
): EncryptedDataResult {
  if (key.length !== 32) {
    throw new Error(`AES-256-GCM requires a 32-byte key, received ${key.length} bytes`);
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), iv);

  if (associatedData) {
    cipher.setAAD(Buffer.from(associatedData));
  }

  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv: new Uint8Array(iv),
    tag: new Uint8Array(tag),
  };
}

/**
 * Standard AES-256-GCM decryption with authentication tag validation.
 */
export function decryptAesGcm(
  key: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  tag: Uint8Array,
  associatedData?: Uint8Array | Buffer
): Uint8Array {
  if (key.length !== 32) {
    throw new Error(`AES-256-GCM requires a 32-byte key, received ${key.length} bytes`);
  }
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(iv));
  decipher.setAuthTag(Buffer.from(tag));

  if (associatedData) {
    decipher.setAAD(Buffer.from(associatedData));
  }

  try {
    const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]);
    return new Uint8Array(decrypted);
  } catch (err) {
    throw new Error('Decryption failed: integrity verification or key mismatch: ' + (err as Error).message);
  }
}

/**
 * Encrypts an individual file chunk.
 */
export function encryptChunk(
  fileKey: Uint8Array,
  chunkIndex: number,
  chunkPlaintext: Uint8Array,
  fileId: string
): EncryptedChunkResult {
  const aad = Buffer.from(`${fileId}:${chunkIndex}`);
  const { ciphertext, iv, tag } = encryptAesGcm(fileKey, chunkPlaintext, aad);
  const hash = computeSha256(ciphertext);

  return {
    chunkIndex,
    ciphertext,
    hash,
    iv: Buffer.from(iv).toString('base64'),
    tag: Buffer.from(tag).toString('base64'),
    size: ciphertext.length,
  };
}

/**
 * Decrypts an individual file chunk.
 */
export function decryptChunk(
  fileKey: Uint8Array,
  chunkIndex: number,
  ciphertext: Uint8Array,
  ivBase64: string,
  tagBase64: string,
  fileId: string
): Uint8Array {
  const iv = Buffer.from(ivBase64, 'base64');
  const tag = Buffer.from(tagBase64, 'base64');
  const aad = Buffer.from(`${fileId}:${chunkIndex}`);
  return decryptAesGcm(fileKey, ciphertext, iv, tag, aad);
}

/**
 * Encrypts metadata object (JSON) under MetadataKey.
 */
export function encryptMetadata(metadataKey: Uint8Array, metadataObj: unknown): {
  encryptedMetadata: string; // base64
  iv: string; // base64
  tag: string; // base64
} {
  const jsonBytes = Buffer.from(JSON.stringify(metadataObj), 'utf8');
  const { ciphertext, iv, tag } = encryptAesGcm(metadataKey, jsonBytes, Buffer.from('file-manifest-metadata'));
  return {
    encryptedMetadata: Buffer.from(ciphertext).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    tag: Buffer.from(tag).toString('base64'),
  };
}

/**
 * Decrypts metadata object under MetadataKey.
 */
export function decryptMetadata<T = unknown>(
  metadataKey: Uint8Array,
  encryptedMetadataBase64: string,
  ivBase64: string,
  tagBase64: string
): T {
  const ciphertext = Buffer.from(encryptedMetadataBase64, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');
  const tag = Buffer.from(tagBase64, 'base64');
  const decrypted = decryptAesGcm(metadataKey, ciphertext, iv, tag, Buffer.from('file-manifest-metadata'));
  const jsonStr = Buffer.from(decrypted).toString('utf8');
  return JSON.parse(jsonStr) as T;
}

/**
 * Splits a file buffer into chunks (default 4 MiB).
 */
export function chunkBuffer(data: Uint8Array, chunkSize: number = 4 * 1024 * 1024): Uint8Array[] {
  if (data.length === 0) {
    return [new Uint8Array(0)];
  }
  const chunks: Uint8Array[] = [];
  let offset = 0;
  while (offset < data.length) {
    const end = Math.min(offset + chunkSize, data.length);
    chunks.push(data.subarray(offset, end));
    offset = end;
  }
  return chunks;
}
