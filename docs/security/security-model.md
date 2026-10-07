# Security Model: Zero-Knowledge Personal Cloud

## 1. Threat Model & Zero-Knowledge Principle

The core tenet of Personal Cloud Storage is **Zero-Knowledge Data Confidentiality**:
Neither the backend servers, relay proxies, untrusted storage nodes, nor eavesdroppers on the wire can inspect user files, decrypt filenames, or reconstruct the master encryption key.

## 2. Server Knowledge vs. Server Blindness

### What the Server Knows
- User Account ID (UUID)
- Registered Device IDs, Device Public Keys, and Device Types
- Encrypted File IDs, Encrypted File Sizes, and Version Numbers
- Chunk Hashes (SHA-256) and Chunk Offsets for sync routing
- Storage Node registration details (online state, total allocated capacity)
- Blinded Remote Recovery Share (Share C in Shamir 2-of-3 scheme)
- Timestamps and deduplication hashes within the user's isolated namespace

### What the Server Must NEVER Know
- Plaintext file contents (Photos, Videos, Documents)
- Master Encryption Key
- Key Encryption Key (KEK) or Metadata Encryption Key
- Individual File Encryption Keys
- Plaintext filenames, album names, directory paths, or EXIF metadata
- Human Recovery Credential (Share B) or Primary Device Share (Share A)

## 3. Cryptographic Invariants
1. **End-to-End Encryption**: Data is chunked and encrypted on the client *before* leaving the device.
2. **Authenticated Encryption**: Every chunk and manifest is protected using Authenticated Encryption with Associated Data (AEAD, AES-256-GCM / XChaCha20-Poly1305). Any tampering results in an authentication tag mismatch and immediate rejection.
3. **Namespace Isolation**: Deduplication operates strictly within a single user's encrypted namespace using keyed or envelope hashing. Cross-user deduplication is forbidden to prevent side-channel leaks.
4. **Device Revocation**: Revoking a device invalidates its device session and triggers key rotation for future files; revoked devices are immediately dropped from sync relays.
