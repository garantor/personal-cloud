import type {
  UserEntity,
  DeviceEntity,
  StorageNodeEntity,
  FileEntity,
  FileChunkEntity,
  StorageLocationEntity,
  RecoveryConfigEntity,
  SessionEntity
} from './types.js';

export class CloudDatabase {
  private users = new Map<string, UserEntity>();
  private devices = new Map<string, DeviceEntity>();
  private storageNodes = new Map<string, StorageNodeEntity>();
  private files = new Map<string, FileEntity>();
  private fileChunks = new Map<string, FileChunkEntity>(); // key: `${fileId}:${chunkIndex}`
  private storageLocations = new Map<string, StorageLocationEntity[]>(); // key: chunkId
  private recoveryConfigs = new Map<string, RecoveryConfigEntity>(); // key: userId
  private sessions = new Map<string, SessionEntity>(); // key: token

  // User Operations
  createUser(user: UserEntity): UserEntity {
    this.users.set(user.id, { ...user });
    return user;
  }

  getUser(id: string): UserEntity | undefined {
    return this.users.get(id);
  }

  getUserByEmail(email: string): UserEntity | undefined {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return u;
    }
    return undefined;
  }

  // Device Operations
  createDevice(device: DeviceEntity): DeviceEntity {
    this.devices.set(device.id, { ...device });
    return device;
  }

  getDevice(id: string): DeviceEntity | undefined {
    return this.devices.get(id);
  }

  getDevicesByUser(userId: string): DeviceEntity[] {
    return Array.from(this.devices.values()).filter(d => d.userId === userId);
  }

  revokeDevice(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;
    device.isRevoked = true;
    this.devices.set(deviceId, device);

    // Invalidate sessions for revoked device
    for (const [token, sess] of this.sessions.entries()) {
      if (sess.deviceId === deviceId) {
        this.sessions.delete(token);
      }
    }
    return true;
  }

  // Storage Node Operations
  upsertStorageNode(node: StorageNodeEntity): StorageNodeEntity {
    this.storageNodes.set(node.id, { ...node });
    return node;
  }

  getStorageNode(id: string): StorageNodeEntity | undefined {
    return this.storageNodes.get(id);
  }

  getStorageNodesByUser(userId: string): StorageNodeEntity[] {
    return Array.from(this.storageNodes.values()).filter(n => n.userId === userId);
  }

  // File Operations
  createFile(file: FileEntity): FileEntity {
    this.files.set(file.id, { ...file });
    return file;
  }

  getFile(id: string): FileEntity | undefined {
    return this.files.get(id);
  }

  getFilesByUser(userId: string): FileEntity[] {
    return Array.from(this.files.values()).filter(f => f.userId === userId);
  }

  // Chunk Operations
  createChunk(chunk: FileChunkEntity): FileChunkEntity {
    this.fileChunks.set(`${chunk.fileId}:${chunk.chunkIndex}`, { ...chunk });
    return chunk;
  }

  getChunk(fileId: string, chunkIndex: number): FileChunkEntity | undefined {
    return this.fileChunks.get(`${fileId}:${chunkIndex}`);
  }

  getChunksForFile(fileId: string): FileChunkEntity[] {
    const chunks: FileChunkEntity[] = [];
    for (const c of this.fileChunks.values()) {
      if (c.fileId === fileId) chunks.push(c);
    }
    return chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  // Storage Location Operations
  recordLocation(loc: StorageLocationEntity): void {
    const list = this.storageLocations.get(loc.chunkId) || [];
    list.push(loc);
    this.storageLocations.set(loc.chunkId, list);
  }

  getLocationsForChunk(chunkId: string): StorageLocationEntity[] {
    return this.storageLocations.get(chunkId) || [];
  }

  // Recovery Config Operations
  setRecoveryConfig(config: RecoveryConfigEntity): void {
    this.recoveryConfigs.set(config.userId, { ...config });
  }

  getRecoveryConfig(userId: string): RecoveryConfigEntity | undefined {
    return this.recoveryConfigs.get(userId);
  }

  // Session Operations
  createSession(session: SessionEntity): SessionEntity {
    this.sessions.set(session.token, { ...session });
    return session;
  }

  getSession(token: string): SessionEntity | undefined {
    const sess = this.sessions.get(token);
    if (!sess) return undefined;
    if (new Date(sess.expiresAt).getTime() < Date.now()) {
      this.sessions.delete(token);
      return undefined;
    }
    return sess;
  }

  deleteSession(token: string): void {
    this.sessions.delete(token);
  }
}
