# Personal Cloud Storage

Personal Cloud Storage turns a user's existing phones, computers, and storage devices into a sovereign **personal cloud storage system** with zero-knowledge end-to-end encryption.

The user experience resembles Google Photos and Google Drive without sacrificing sovereignty, cryptographic privacy, or device ownership.

---

## 🏗️ Repository Architecture

This repository is structured as a TypeScript monorepo with strict layer boundaries:

```text
personal-cloud/
│
├── apps/
│   ├── web/                    # React + Vite web client (client-side decryption, gallery, recovery UX)
│   ├── desktop/                # Desktop Storage Node engine (500GB allocation, blob store, background daemon)
│   └── mobile/                 # Mobile sync client (photo discovery, persistent queue, background upload)
│
├── services/
│   ├── api/                    # Fastify zero-knowledge REST & WebSocket sync backend
│   ├── sync/                   # Sync coordination & relay service
│   └── storage-orchestrator/   # Multi-provider replication & durability orchestration
│
├── packages/
│   ├── crypto/                 # AES-256-GCM, HKDF, CSPRNG, Shamir 2-of-3 secret sharing, GF(256)
│   ├── file-manifest/          # Encrypted file manifest schemas, validation & serialization
│   ├── protocol/               # Wire formats, RPC contracts, WebSocket sync events
│   ├── storage/                # StorageProvider abstraction, Local, Remote, Decentralized (Storj)
│   ├── sync-engine/            # Deterministic state machine, deduplication, retry & network policies
│   ├── recovery/               # 2-of-3 Shamir recovery manager & human-friendly recovery codes
│   ├── database/               # Zero-knowledge persistence repository & schemas
│   └── blockchain/             # Identity & device registry adapter, storage commitments & marketplace
│
├── infrastructure/
│   ├── docker/                 # Docker Compose configuration
│   ├── postgres/               # PostgreSQL zero-knowledge schema
│   └── redis/                  # Redis caching & pub/sub configuration
│
└── docs/
    ├── architecture/           # System overview & StorageProvider interface
    ├── security/               # Zero-knowledge threat model & cryptographic hierarchy
    ├── protocols/              # Deterministic sync state machine & multi-device coordination
    └── recovery/               # 2-of-3 Shamir Secret Sharing recovery design
```

---

## 🔒 Security Invariants & Acceptance Criteria

1. **Zero-Knowledge Core**: Plaintext files, plaintext filenames, and master encryption keys never touch backend servers or database records.
2. **Deterministic State Machine**: Every asset progresses deterministically:
   `DISCOVERED` ➔ `QUEUED` ➔ `ENCRYPTING` ➔ `CHUNKING` ➔ `UPLOADING` ➔ `VERIFYING` ➔ `STORED` ➔ `BACKED_UP`.
3. **2-of-3 Shamir Recovery**:
   - **Share A**: Stored in device Keychain / Secure Enclave.
   - **Share B**: Human-friendly recovery code (`RC-XXXX-XXXX-...`).
   - **Share C**: Blinded remote share stored on backend relay.
   - A single share reveals **0 bits of information**; any 2 shares restore the Master Key.
4. **Content Deduplication**: Isolated strictly within the user's encrypted namespace.
5. **Rule 10 (Durability)**: Never deletes local copy before verified replication on external nodes.

---

## 🚀 Quickstart & Verification

### Install Dependencies
```bash
npm install
```

### Run All Unit & Integration Tests (10/10 test suites)
```bash
npm run test:all
```

### Run Official 23-Step End-to-End Acceptance Test
```bash
npm run test:e2e
```

### Start Web Application (Development Server)
```bash
npm run dev:web
```

### Start Desktop Storage Node
```bash
npm run start:desktop
```

### Start Backend API
```bash
npm run start:api
```