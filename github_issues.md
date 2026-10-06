# Personal Cloud Storage - GitHub Issues

This document breaks down the Personal Cloud Storage specification into actionable GitHub issues, grouped by the defined development phases.

---

## Phase 0 — Architecture

### [Issue 1] Create Core Architecture Documents
**Description:**
Create the initial architecture and design documents to establish internal consistency before any production code is written.

**Tasks:**
- [ ] Create `architecture.md` (System overview, four layers, components)
- [ ] Create `security-model.md` (Zero-knowledge rules, server knowledge vs. blindness)
- [ ] Create `crypto-design.md` (Hierarchical encryption, master/metadata/file keys)
- [ ] Create `sync-protocol.md` (Sync state machine, states from DISCOVERED to BACKED_UP)
- [ ] Create `recovery-design.md` (2-of-3 Shamir sharing, recovery scenarios)
- [ ] Create `storage-provider-interface.md` (Storage Orchestrator abstraction)

**Acceptance Criteria:**
- All 6 documents are created and reviewed.
- Documents are internally consistent and adhere to zero-knowledge requirements.

**Labels:** `documentation`, `architecture`, `phase-0`

---

## Phase 1 — Crypto Core

### [Issue 2] Implement Cryptographic Key Generation and Wrapping
**Description:**
Implement the core cryptographic primitives for key generation and hierarchical key wrapping using established libraries (XChaCha20-Poly1305/AES-256-GCM, HKDF-SHA-256). Do not implement crypto from scratch.

**Tasks:**
- [ ] Implement Master Key generation (CSPRNG).
- [ ] Implement Key Encryption Key (KEK) derivation.
- [ ] Implement File Key generation.
- [ ] Implement Key wrapping and unwrapping functionality.

**Acceptance Criteria:**
- Key derivation and generation uses audited libraries.
- KEK can successfully wrap and unwrap File Keys.

**Labels:** `crypto`, `backend`, `mobile`, `desktop`, `phase-1`

### [Issue 3] Implement File and Chunk Encryption/Decryption
**Description:**
Implement the chunking and encryption pipelines. Large files must be split into chunks (default 4 MiB) and individually encrypted.

**Tasks:**
- [ ] Implement file chunking logic (4 MiB default).
- [ ] Implement encryption for individual chunks using XChaCha20-Poly1305 or AES-256-GCM.
- [ ] Implement decryption and reassembly of file chunks.

**Acceptance Criteria:**
- Files are successfully chunked, encrypted, decrypted, and reassembled.
- Tampered ciphertext fails decryption.

**Labels:** `crypto`, `core`, `phase-1`

### [Issue 4] Implement Manifest Encryption and Hash Verification
**Description:**
Implement the encrypted file manifest format and cryptographic hashing for integrity verification.

**Tasks:**
- [ ] Define the encrypted manifest structure (fileId, contentHash, size, chunks).
- [ ] Implement metadata encryption (filename, timestamps, etc.).
- [ ] Implement chunk hashing and verification.

**Acceptance Criteria:**
- Manifests can be encrypted and decrypted.
- Chunk hashes correctly verify data integrity.

**Labels:** `crypto`, `core`, `phase-1`

### [Issue 5] Implement Shamir 2-of-3 Secret Sharing
**Description:**
Implement Shamir Secret Sharing to split the Master Key into 3 shares for the recovery protocol.

**Tasks:**
- [ ] Implement 2-of-3 Shamir splitting for the Master Key.
- [ ] Implement recovery reconstruction from any 2 valid shares.
- [ ] Write unit tests for missing shares, invalid shares, and threshold failures.

**Acceptance Criteria:**
- A file encrypted on device A can only be decrypted by an authorized device possessing the required key material.
- 2 shares can successfully reconstruct the Master Key; 1 share fails.

**Labels:** `crypto`, `recovery`, `phase-1`

---

## Phase 2 — Backend

### [Issue 6] Backend: Implement Auth, Users, and Devices Management
**Description:**
Set up the core backend services using Node.js, TypeScript, PostgreSQL, and Redis. Implement authentication and device registries.

**Tasks:**
- [ ] Initialize Fastify/NestJS backend and database schemas (User, Device).
- [ ] Implement account creation and passkey authentication (WebAuthn).
- [ ] Implement device registration and cryptographic identity generation.
- [ ] Implement device revocation.

**Acceptance Criteria:**
- Users can register and authenticate using passkeys.
- Devices can be registered and revoked.
- No master keys or plaintext passwords/data reach the database.

**Labels:** `backend`, `auth`, `phase-2`

### [Issue 7] Backend: Implement File, Chunk, and Manifest Management
**Description:**
Implement the backend components to handle file metadata, manifest storage, and storage node registries.

**Tasks:**
- [ ] Create database schemas for File, FileVersion, FileChunk, StorageLocation.
- [ ] Implement API endpoints to submit and retrieve encrypted manifests.
- [ ] Implement storage-node registry endpoints.

**Acceptance Criteria:**
- Backend stores and retrieves file manifests.
- Database records contain only encrypted metadata and hashes.

**Labels:** `backend`, `api`, `phase-2`

### [Issue 8] Backend: Implement Upload/Download Sessions and Sync State
**Description:**
Implement upload and download coordination, ensuring large files can be uploaded/downloaded in chunks.

**Tasks:**
- [ ] Implement upload session endpoints (initiate, upload chunks, complete).
- [ ] Implement download session endpoints.
- [ ] Implement sync state tracking endpoints.

**Acceptance Criteria:**
- Uploads and downloads can be interrupted and resumed.
- Backend logs and responses contain no plaintext.

**Labels:** `backend`, `sync`, `phase-2`

---

## Phase 3 — Desktop Storage Node

### [Issue 9] Desktop: Setup Application Shell and Storage Allocation
**Description:**
Initialize the desktop app (Tauri/Rust or Electron/Node) and allow it to register as a local storage node.

**Tasks:**
- [ ] Setup cross-platform desktop application shell (macOS, Windows, Linux).
- [ ] Implement UI for storage allocation (e.g., reserve 500GB).
- [ ] Implement device registration with the backend.

**Acceptance Criteria:**
- Desktop registers as a storage node without manual networking/port-forwarding.
- User can configure storage capacity and minimum free space rules.

**Labels:** `desktop`, `storage-node`, `phase-3`

### [Issue 10] Desktop: Implement File Reception and Chunk Verification
**Description:**
Allow the desktop node to act as a secure relay receiver, handling incoming encrypted chunks and storing them.

**Tasks:**
- [ ] Implement secure relay connection to receive encrypted chunks.
- [ ] Implement chunk integrity verification upon receipt.
- [ ] Store chunks locally and report storage location to backend.
- [ ] Implement automatic resumption of interrupted transfers.

**Acceptance Criteria:**
- Encrypted chunks are successfully received, verified, and stored.
- Resumable transfers work successfully.

**Labels:** `desktop`, `storage-node`, `phase-3`

### [Issue 11] Desktop: Disk Monitoring and Background Operation
**Description:**
Ensure the desktop application runs reliably in the background and monitors local health.

**Tasks:**
- [ ] Implement background process support and start-on-boot.
- [ ] Implement disk space monitoring and health reporting to the backend.

**Acceptance Criteria:**
- App survives restarts and runs silently in the background.
- Node accurately reports available capacity and health.

**Labels:** `desktop`, `system`, `phase-3`

---

## Phase 4 — Mobile Photo Backup

### [Issue 12] Mobile: Photo Discovery and Local Sync Queue
**Description:**
Initialize the mobile app (React Native/Expo) and implement photo/video discovery using native APIs (PhotoKit/MediaStore).

**Tasks:**
- [ ] Setup React Native mobile app (iOS and Android).
- [ ] Implement background detection of new and changed photos/videos.
- [ ] Create persistent local SQLite database for the upload queue (asset_id, backup_status).

**Acceptance Criteria:**
- New photos are automatically detected and added to the local SQLite queue.
- Sync queue survives app termination.

**Labels:** `mobile`, `sync`, `phase-4`

### [Issue 13] Mobile: Implement Chunking, Encryption, and Upload Pipeline
**Description:**
Implement the file processing pipeline on mobile, moving items from the local queue to the backend.

**Tasks:**
- [ ] Implement local encryption and chunking on the mobile device.
- [ ] Implement upload sequence (ENCRYPTING -> CHUNKING -> UPLOADING -> VERIFYING -> BACKED_UP).
- [ ] Implement progress tracking and pause/resume logic.

**Acceptance Criteria:**
- Photos are encrypted, chunked, and uploaded in the background.
- Taking a new photo eventually results in a verified encrypted backup without manual intervention.

**Labels:** `mobile`, `core`, `phase-4`

### [Issue 14] Mobile: Implement Network/Storage Policies and Deduplication
**Description:**
Implement user preferences for uploading and content-addressed deduplication.

**Tasks:**
- [ ] Implement Wi-Fi-only, charging-only, and background sync settings.
- [ ] Implement content hashing for deduplication before upload.
- [ ] Implement logic to skip uploading existing encrypted content within the user's namespace.

**Acceptance Criteria:**
- App respects network conditions (e.g., pauses on cellular if Wi-Fi only is set).
- Duplicate photos (exact content hash) are not re-uploaded.

**Labels:** `mobile`, `network`, `phase-4`

---

## Phase 5 — Multi-device Sync

### [Issue 15] Core: Implement Multi-device Sync Protocol
**Description:**
Implement the logic required for devices to synchronize files securely across the personal cloud.

**Tasks:**
- [ ] Implement sync coordination via WebSocket/event channels.
- [ ] Implement Phone -> Desktop and Desktop -> Phone synchronization logic.
- [ ] Handle encrypted manifest distribution across authorized devices.

**Acceptance Criteria:**
- A file created on device A becomes available on authorized device B without exposing plaintext to the backend.
- Files download, decrypt, and display successfully on secondary devices.

**Labels:** `core`, `sync`, `phase-5`

---

## Phase 6 — Recovery

### [Issue 16] Core: Implement 2-of-3 Recovery Setup
**Description:**
Implement the 2-of-3 Shamir Secret Sharing recovery setup flow.

**Tasks:**
- [ ] Implement creation of the Primary Device Share (Share A, stored in Keychain/Keystore).
- [ ] Implement creation and UI for Recovery Credential (Share B).
- [ ] Implement creation and encrypted storage of Remote Share (Share C).

**Acceptance Criteria:**
- Recovery is successfully configured during onboarding.
- One share alone cannot reconstruct the Master Key.

**Labels:** `recovery`, `crypto`, `phase-6`

### [Issue 17] Core: Implement Account Recovery Workflows
**Description:**
Implement the workflows to restore access when a primary device is lost.

**Tasks:**
- [ ] Implement recovery flow using Recovery Credential + Remote Share.
- [ ] Implement reconstruction of the Master Key and registration of a new device.
- [ ] Implement recovery flow using another trusted device.

**Acceptance Criteria:**
- Destroying the original phone and using two valid recovery components successfully recovers the account on a new phone.
- Data remains protected if only one share is available.

**Labels:** `recovery`, `auth`, `phase-6`

---

## Phase 7 — Web

### [Issue 18] Web: Implement Core Application Shell and Device Management
**Description:**
Build the web interface to allow users to manage their personal cloud.

**Tasks:**
- [ ] Setup React/TypeScript web application.
- [ ] Implement passkey login.
- [ ] Implement device and storage management screens.
- [ ] Implement recovery settings view.

**Acceptance Criteria:**
- Users can log in securely and manage their devices/storage.

**Labels:** `web`, `ui`, `phase-7`

### [Issue 19] Web: Implement Browser-Side Decryption and Gallery
**Description:**
Implement the file browser and photo gallery in the web app, ensuring files are decrypted in the browser.

**Tasks:**
- [ ] Implement downloading of encrypted chunks.
- [ ] Implement Web Crypto API for client-side decryption.
- [ ] Implement encrypted thumbnails loading and photo gallery view.

**Acceptance Criteria:**
- Photos and files can be viewed and downloaded on the web.
- The web server never receives plaintext file keys.

**Labels:** `web`, `crypto`, `phase-7`

---

## Phase 8 — Decentralized Storage

### [Issue 20] Core: Implement Decentralized Storage Provider Adapters
**Description:**
Integrate an external decentralized storage network (e.g., Storj or Filecoin) using the StorageProvider adapter pattern.

**Tasks:**
- [ ] Implement the `StorageProvider` interface for an external decentralized network.
- [ ] Route encrypted chunks to the external provider as a remote backup.
- [ ] Update durability state tracking.

**Acceptance Criteria:**
- User data can be securely encrypted locally and stored on an external decentralized provider.
- Application storage interface remains unchanged.

**Labels:** `storage`, `decentralized`, `phase-8`

---

## Phase 9 — Blockchain

### [Issue 21] Blockchain: Implement Core Blockchain Integrations
**Description:**
Implement optional blockchain layer features for ownership and device registries without breaking core functionality.

**Tasks:**
- [ ] Create `BlockchainAdapter` interface.
- [ ] Implement wallet/account association.
- [ ] Implement on-chain device registry and storage commitments.
- [ ] Ensure application gracefully falls back if blockchain is unreachable.

**Acceptance Criteria:**
- Blockchain interactions work independently of basic file synchronization.
- Files are NOT put on-chain.

**Labels:** `blockchain`, `web3`, `phase-9`

---

## Phase 10 — Storage Marketplace

### [Issue 22] Marketplace: Implement Provider Onboarding and Contracts
**Description:**
Allow users to rent out unused capacity on their personal nodes to other users via encrypted storage contracts.

**Tasks:**
- [ ] Implement UI for "Rent unused space".
- [ ] Implement storage pricing, proof/verification, and payments logic via blockchain adapters.
- [ ] Implement provider reputation system.

**Acceptance Criteria:**
- Users can opt-in to rent space.
- Files stored on marketplace nodes remain encrypted and inaccessible to the node operator.
- Payments and rewards process correctly.

**Labels:** `marketplace`, `blockchain`, `phase-10`

---

## Final Validation

### [Issue 23] End-to-End MVP Acceptance Test
**Description:**
Ensure the entire application passes the complete 23-step E2E scenario outlined in the product specification.

**Tasks:**
- [ ] Write E2E integration test scripts mirroring the acceptance criteria.
- [ ] Perform manual testing for all scenarios including device loss and resumption of interrupted network transfers.
- [ ] Audit security constraints (no plaintext on backend, device revocation works, file integrity verified).

**Acceptance Criteria:**
- All 23 steps of the End-to-End Acceptance Test pass successfully.
- Security constraints in Section 42 are fully met.

**Labels:** `testing`, `e2e`, `security`, `release-blocker`
