# Architecture Specification: Personal Cloud Storage

## 1. System Overview

Personal Cloud Storage is a consumer-grade, zero-knowledge personal storage and backup system that turns a user's existing phones, computers, and storage devices into a unified, encrypted cloud. The user experience mirrors Google Photos and Google Drive without sacrificing sovereignty, cryptographic privacy, or device ownership.

```
┌──────────────────────────────────────────────────────────────┐
│                         USER EXPERIENCE                       │
│                                                              │
│ Mobile App (iOS/Android) │ Desktop App │ Web App             │
│ Photos, Videos, Backups  │ Storage Node│ Gallery & Recovery  │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                       PERSONAL CLOUD                          │
│                                                              │
│ Sync Engine │ Encryption │ Metadata │ Device Management      │
│ Recovery    │ File Index │ Upload Queue │ Download Manager   │
└──────────────────────────────┬───────────────────────────────┘
                               │
             ┌─────────────────┼─────────────────┐
             ▼                 ▼                 ▼
┌──────────────────┐ ┌──────────────────┐ ┌───────────────────┐
│ PERSONAL DEVICES │ │ STORAGE NETWORK  │ │ BLOCKCHAIN LAYER  │
│                  │ │                  │ │ (Optional V2/V3)  │
│ Phone            │ │ Remote Backup /  │ │ Ownership         │
│ Laptop           │ │ Storj / Filecoin │ │ Storage Contracts │
│ Desktop / NAS    │ │ Decentralized    │ │ Payments & Rewards│
└──────────────────┘ └──────────────────┘ └───────────────────┘
```

## 2. The Four Architectural Layers

### Layer 1: User Experience
- **Mobile (iOS & Android)**: Automatic background photo/video backup using native APIs (PhotoKit/MediaStore), local SQLite queue, passkey login, gallery viewing.
- **Desktop (macOS/Windows/Linux)**: Personal storage node daemon and control dashboard. Allocates dedicated disk capacity, receives encrypted chunks via secure relay, monitors health, operates silently in background.
- **Web App**: Client-side browser decryption (WebCrypto API), photo/video gallery, file explorer, device trust manager, and recovery portal.

### Layer 2: Personal Cloud Core Engine
- **Hierarchical Encryption Engine**: Master Key -> Key Encryption Key (KEK) & Metadata Key -> Per-File Keys -> Per-Chunk Ciphertexts.
- **Sync Engine & State Machine**: Deterministic progression (`DISCOVERED` -> `QUEUED` -> `ENCRYPTING` -> `CHUNKING` -> `UPLOADING` -> `VERIFYING` -> `STORED` -> `BACKED_UP`).
- **Resumable Upload & Download Orchestration**: Fixed 4 MiB chunks with SHA-256 verification and resume tokens.
- **2-of-3 Recovery Engine**: Shamir Secret Sharing splitting Master Key across Primary Device (Share A), Human Recovery Code (Share B), and Remote Relay Share (Share C).

### Layer 3: Storage Providers & Relays
- **Personal Storage Node**: User's local computer storing encrypted chunks.
- **Secure Backend Relay**: End-to-end encrypted relay proxy for NAT traversal without exposing plaintext.
- **Decentralized Storage Adapters**: Storj, Filecoin, and remote backup adapters matching the unified `StorageProvider` interface.

### Layer 4: Optional Blockchain & Marketplace Layer
- Decoupled from file sync and storage operations.
- Identity registry, device authorization attestations, storage verification contracts, and decentralized marketplace incentives for renting unused disk capacity.
