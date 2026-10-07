import type { WrappedKeyPayload } from '@personal-cloud/crypto';

export interface FileMetadataPlaintext {
  filename: string;
  mimeType: string;
  folder?: string;
  album?: string;
  exif?: Record<string, unknown>;
  createdAt: string;
  modifiedAt?: string;
  thumbnailHash?: string;
}

export interface ChunkDescriptor {
  index: number;
  hash: string; // SHA-256 of encrypted chunk
  size: number; // size in bytes of encrypted chunk
  iv: string;   // base64
  tag: string;  // base64
}

export interface EncryptedFileManifest {
  fileId: string;
  version: number;
  contentHash: string; // SHA-256 of plaintext original
  totalPlaintextSize: number;
  totalEncryptedSize: number;
  encryptedMetadata: string; // base64 JSON
  metadataIv: string;        // base64
  metadataTag: string;       // base64
  wrappedFileKey: WrappedKeyPayload;
  chunks: ChunkDescriptor[];
  createdAt: string;
  updatedAt: string;
}
