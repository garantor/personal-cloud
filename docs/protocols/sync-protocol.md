# Sync Protocol: State Machine & Multi-Device Coordination

## 1. Deterministic State Machine

Every local media asset transitions through a deterministic state machine:

```
DISCOVERED
    │ (Discovered by PhotoKit / MediaStore watcher)
    ▼
QUEUED
    │ (Scheduled according to network/charging policy)
    ▼
ENCRYPTING
    │ (MasterKey derives KEK; FileKey generated; metadata encrypted)
    ▼
CHUNKING
    │ (Partitioned into 4 MiB chunks; each chunk encrypted under FileKey)
    ▼
UPLOADING
    │ (Chunks pushed to relay / backend / desktop node; resumable)
    ▼
VERIFYING
    │ (SHA-256 chunk verification + manifest commit check)
    ▼
STORED
    │ (Stored on at least one authenticated personal node)
    ▼
BACKED_UP
```

### Failure & Retry Transitions
```
ANY STATE ──(Error)──► FAILED ──(Retry Timer / Network Event)──► Previous State / QUEUED
```

## 2. Queue Durability
- The sync queue is persisted to a local SQLite database (`Asset`, `File`, `Upload`, `Chunk`, `SyncJob`).
- Queue state survives unexpected app crashes, phone restarts, and OS background kills.
- On launch, the sync engine re-queries `QUEUED` / `UPLOADING` records and resumes from the first unverified chunk.

## 3. Network & Battery Policies
- `wifiOnly`: When enabled, uploads pause if the device is on cellular data.
- `chargingOnly`: When enabled, uploads pause if device is on battery power.
- `backgroundSync`: Uploads register OS background execution tasks (iOS BGTaskScheduler / Android WorkManager).

## 4. Multi-Device Propagation
- Real-time synchronization is driven via authenticated WebSockets.
- When an asset reaches `BACKED_UP`:
  1. The uploading device commits the manifest to the backend sync service.
  2. The backend broadcasts a `file.created` or `file.updated` event to the user's active device sessions.
  3. Listening desktop storage nodes pull pending chunks for replica durability.
  4. Viewing devices (mobile/web) update their local indices and fetch encrypted thumbnails on demand.
