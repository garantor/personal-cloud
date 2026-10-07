# Cryptographic Design: Hierarchical Encryption & Key Derivation

## 1. Key Hierarchy

To enable performant sharing, efficient updates, and instant revocation without re-encrypting the entire cloud, encryption keys follow a strict hierarchy:

```
                    MASTER KEY (256 bits CSPRNG)
                              │
                    ┌─────────┴─────────┐
                    │                   │
              Metadata Key      Key Encryption Key (KEK)
          (Derived via HKDF)      (Derived via HKDF)
                                        │
                              ┌─────────┼─────────┐
                              ▼         ▼         ▼
                          File Key   File Key   File Key
                          (Random)   (Random)   (Random)
                              │         │         │
                              ▼         ▼         ▼
                            Photo     Video     Document
```

## 2. Key Derivation Specifications
- **Master Key**: Generated using an OS-level Cryptographically Secure Pseudorandom Number Generator (CSPRNG, `crypto.randomBytes(32)`).
- **Subkey Derivation (HKDF-SHA-256)**:
  - `KEK = HKDF(MasterKey, salt="personal-cloud-kek-salt", info="KEK-v1", length=32)`
  - `MetadataKey = HKDF(MasterKey, salt="personal-cloud-meta-salt", info="META-v1", length=32)`
- **File Key**: A fresh 256-bit CSPRNG key generated for every file.
- **Wrapped File Key**: Encrypted using AES-256-GCM under the user's `KEK` with a unique 96-bit IV:
  `WrappedKey = AES256-GCM(Key=KEK, IV=iv, Plaintext=FileKey)`

## 3. Chunk Encryption & Integrity
- Files are divided into chunks (default 4 MiB = 4,194,304 bytes).
- Each chunk is encrypted using AES-256-GCM:
  - Key: `FileKey`
  - Nonce/IV: 12 bytes derived deterministically or generated per-chunk `(NoncePrefix || ChunkIndex)`
  - Associated Data: `FileID || ChunkIndex`
- Chunk Verification:
  - `ChunkHash = SHA256(EncryptedChunkPayload)`
  - Stored in the encrypted file manifest for end-to-end integrity checks before decryption.

## 4. Manifest Encryption
- The manifest describes:
  - `fileId`: UUIDv4
  - `version`: integer
  - `contentHash`: SHA-256 of complete original file
  - `size`: total file size
  - `encryptedMetadata`: AES-256-GCM encrypted payload (original filename, mimeType, EXIF, creation timestamp) under `MetadataKey`
  - `wrappedFileKey`: wrapped under `KEK`
  - `chunks`: array of chunk indexes, byte sizes, and encrypted chunk hashes.
