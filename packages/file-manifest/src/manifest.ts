import {
  generateFileKey,
  wrapFileKey,
  unwrapFileKey,
  encryptMetadata,
  decryptMetadata,
  chunkBuffer,
  encryptChunk,
  decryptChunk,
  computeSha256
} from '@personal-cloud/crypto';
import type {
  EncryptedFileManifest,
  FileMetadataPlaintext,
  ChunkDescriptor
} from './types.js';

export interface CreateManifestParams {
  fileId: string;
  data: Uint8Array;
  metadata: FileMetadataPlaintext;
  kek: Uint8Array;
  metadataKey: Uint8Array;
  chunkSize?: number;
}

export interface EncryptedFileResult {
  manifest: EncryptedFileManifest;
  encryptedChunks: Array<{
    index: number;
    hash: string;
    data: Uint8Array;
    iv: string;
    tag: string;
  }>;
}

/**
 * Creates an encrypted file manifest and encrypted chunks from raw plaintext data.
 */
export function createEncryptedFile(params: CreateManifestParams): EncryptedFileResult {
  const { fileId, data, metadata, kek, metadataKey, chunkSize = 4 * 1024 * 1024 } = params;

  const contentHash = computeSha256(data);
  const fileKey = generateFileKey();
  const wrappedFileKey = wrapFileKey(kek, fileKey);

  const encMeta = encryptMetadata(metadataKey, metadata);

  const rawChunks = chunkBuffer(data, chunkSize);
  const chunks: ChunkDescriptor[] = [];
  const encryptedChunks: EncryptedFileResult['encryptedChunks'] = [];

  let totalEncryptedSize = 0;

  for (let i = 0; i < rawChunks.length; i++) {
    const encChunk = encryptChunk(fileKey, i, rawChunks[i], fileId);
    chunks.push({
      index: i,
      hash: encChunk.hash,
      size: encChunk.size,
      iv: encChunk.iv,
      tag: encChunk.tag,
    });
    encryptedChunks.push({
      index: i,
      hash: encChunk.hash,
      data: encChunk.ciphertext,
      iv: encChunk.iv,
      tag: encChunk.tag,
    });
    totalEncryptedSize += encChunk.size;
  }

  const manifest: EncryptedFileManifest = {
    fileId,
    version: 1,
    contentHash,
    totalPlaintextSize: data.length,
    totalEncryptedSize,
    encryptedMetadata: encMeta.encryptedMetadata,
    metadataIv: encMeta.iv,
    metadataTag: encMeta.tag,
    wrappedFileKey,
    chunks,
    createdAt: metadata.createdAt,
    updatedAt: metadata.createdAt,
  };

  return { manifest, encryptedChunks };
}

/**
 * Decrypts a full file given its manifest, encrypted chunks, kek, and metadataKey.
 */
export function decryptFileFromManifest(
  manifest: EncryptedFileManifest,
  encryptedChunks: Array<{ index: number; data: Uint8Array }>,
  kek: Uint8Array,
  metadataKey: Uint8Array
): {
  data: Uint8Array;
  metadata: FileMetadataPlaintext;
} {
  // 1. Decrypt metadata
  const metadata = decryptMetadata<FileMetadataPlaintext>(
    metadataKey,
    manifest.encryptedMetadata,
    manifest.metadataIv,
    manifest.metadataTag
  );

  // 2. Unwrap file key
  const fileKey = unwrapFileKey(kek, manifest.wrappedFileKey);

  // 3. Decrypt and verify each chunk in manifest order
  const chunkMap = new Map<number, Uint8Array>();
  for (const item of encryptedChunks) {
    chunkMap.set(item.index, item.data);
  }

  const decryptedChunks: Uint8Array[] = [];

  for (const desc of manifest.chunks) {
    const chunkData = chunkMap.get(desc.index);
    if (!chunkData) {
      throw new Error(`Missing chunk index ${desc.index} for file ${manifest.fileId}`);
    }

    const calculatedHash = computeSha256(chunkData);
    if (calculatedHash !== desc.hash) {
      throw new Error(`Chunk ${desc.index} hash mismatch: expected ${desc.hash}, got ${calculatedHash}`);
    }

    const decrypted = decryptChunk(fileKey, desc.index, chunkData, desc.iv, desc.tag, manifest.fileId);
    decryptedChunks.push(decrypted);
  }

  const completeData = Buffer.concat(decryptedChunks);
  const finalContentHash = computeSha256(completeData);
  if (finalContentHash !== manifest.contentHash) {
    throw new Error(`Final content hash mismatch: expected ${manifest.contentHash}, got ${finalContentHash}`);
  }

  return { data: new Uint8Array(completeData), metadata };
}
