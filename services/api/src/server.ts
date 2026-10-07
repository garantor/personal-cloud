import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';

import { CloudDatabase, type UserEntity, type DeviceEntity } from '@personal-cloud/database';
import {
  LocalStorageProvider,
  RemoteBackupProvider,
  type StorageProvider,
  type EncryptedChunk
} from '@personal-cloud/storage';
import { SimulatedBlockchainAdapter, StorageMarketplace } from '@personal-cloud/blockchain';
import type { EncryptedFileManifest } from '@personal-cloud/file-manifest';
import type { SyncEvent, RelayChunkEnvelope, RelayAck } from '@personal-cloud/protocol';

export interface AppServerOptions {
  storageProvider?: StorageProvider;
  database?: CloudDatabase;
  port?: number;
}

export function buildServer(options: AppServerOptions = {}): FastifyInstance {
  const server = Fastify({ logger: false });
  const db = options.database || new CloudDatabase();
  const storage: StorageProvider = options.storageProvider || new RemoteBackupProvider({ id: 'backend-relay-store' });
  const blockchain = new SimulatedBlockchainAdapter();
  const marketplace = new StorageMarketplace(blockchain);

  // Active WebSocket clients: userId -> Set<WebSocket>
  const wsConnections = new Map<string, Set<WebSocket>>();

  function broadcastEvent(userId: string, event: SyncEvent) {
    const clients = wsConnections.get(userId);
    if (!clients) return;
    const msg = JSON.stringify(event);
    for (const ws of clients) {
      try {
        if (ws.readyState === ws.OPEN) {
          ws.send(msg);
        }
      } catch {
        // ignore dead sockets
      }
    }
  }

  server.register(cors, { origin: true });
  server.register(fastifyWebsocket);

  // Helper auth check
  async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<{ user: UserEntity; device?: DeviceEntity } | null> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({ error: 'Missing or invalid Authorization header' });
      return null;
    }
    const token = authHeader.slice(7);
    const session = db.getSession(token);
    if (!session) {
      reply.status(401).send({ error: 'Session expired or revoked' });
      return null;
    }
    const user = db.getUser(session.userId);
    if (!user) {
      reply.status(401).send({ error: 'User not found' });
      return null;
    }
    const device = db.getDevice(session.deviceId);
    if (device && device.isRevoked) {
      reply.status(403).send({ error: 'Device has been revoked' });
      return null;
    }
    return { user, device };
  }

  // --- Health ---
  server.get('/health', async () => {
    const stHealth = await storage.health();
    return {
      status: 'healthy',
      time: new Date().toISOString(),
      storage: stHealth,
      blockchain: blockchain.isAvailable(),
    };
  });

  // --- Auth Endpoints ---
  server.post('/v1/auth/register', async (req, reply) => {
    const body = req.body as { email: string; deviceName?: string; deviceType?: string };
    if (!body?.email) return reply.status(400).send({ error: 'Email required' });

    let user = db.getUserByEmail(body.email);
    if (!user) {
      user = db.createUser({
        id: `usr-${randomUUID().slice(0, 8)}`,
        email: body.email,
        createdAt: new Date().toISOString(),
      });
    }

    const device = db.createDevice({
      id: `dev-${randomUUID().slice(0, 8)}`,
      userId: user.id,
      name: body.deviceName || 'Primary Device',
      type: (body.deviceType as any) || 'mobile_ios',
      publicKey: `pub-${randomUUID().slice(0, 12)}`,
      isRevoked: false,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    const token = `token-${randomUUID()}`;
    db.createSession({
      id: `sess-${randomUUID().slice(0, 8)}`,
      userId: user.id,
      deviceId: device.id,
      token,
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    return reply.status(201).send({
      user: { id: user.id, email: user.email },
      device: { id: device.id, name: device.name, type: device.type },
      token,
    });
  });

  server.post('/v1/auth/passkey/register', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    const body = req.body as { credentialId: string; publicKey: string };
    auth.user.passkeyCredentialId = body.credentialId;
    auth.user.passkeyPublicKey = body.publicKey;
    db.createUser(auth.user);
    return { success: true };
  });

  server.post('/v1/auth/passkey/login', async (req, reply) => {
    const body = req.body as { email: string; credentialId: string; deviceName?: string; deviceType?: string };
    const user = db.getUserByEmail(body.email);
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const device = db.createDevice({
      id: `dev-${randomUUID().slice(0, 8)}`,
      userId: user.id,
      name: body.deviceName || 'Web Client',
      type: (body.deviceType as any) || 'web',
      publicKey: `pub-${randomUUID().slice(0, 12)}`,
      isRevoked: false,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    const token = `token-${randomUUID()}`;
    db.createSession({
      id: `sess-${randomUUID().slice(0, 8)}`,
      userId: user.id,
      deviceId: device.id,
      token,
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    return {
      user: { id: user.id, email: user.email },
      device: { id: device.id, name: device.name, type: device.type },
      token,
    };
  });

  // --- Devices ---
  server.get('/v1/devices', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    return db.getDevicesByUser(auth.user.id);
  });

  server.post('/v1/devices', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    const body = req.body as { name: string; type: string; publicKey: string };
    const device = db.createDevice({
      id: `dev-${randomUUID().slice(0, 8)}`,
      userId: auth.user.id,
      name: body.name,
      type: (body.type as any) || 'desktop_mac',
      publicKey: body.publicKey,
      isRevoked: false,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    broadcastEvent(auth.user.id, {
      type: 'device.registered',
      device: {
        deviceId: device.id,
        userId: device.userId,
        name: device.name,
        type: device.type,
        publicKey: device.publicKey,
        createdAt: device.createdAt,
        lastSeenAt: device.lastSeenAt,
        isRevoked: device.isRevoked,
      },
    });

    return reply.status(201).send(device);
  });

  server.delete('/v1/devices/:id', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const success = db.revokeDevice(id);
    if (success) {
      broadcastEvent(auth.user.id, { type: 'device.revoked', deviceId: id });
    }
    return { success, deviceId: id };
  });

  // --- Storage Nodes ---
  server.get('/v1/storage-nodes', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    return db.getStorageNodesByUser(auth.user.id);
  });

  server.post('/v1/storage-nodes', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    const body = req.body as { deviceId: string; allocatedBytes: number };
    const node = db.upsertStorageNode({
      id: `node-${randomUUID().slice(0, 8)}`,
      deviceId: body.deviceId,
      userId: auth.user.id,
      allocatedBytes: body.allocatedBytes || 500 * 1024 * 1024 * 1024,
      usedBytes: 0,
      availableBytes: body.allocatedBytes || 500 * 1024 * 1024 * 1024,
      status: 'online',
      lastHeartbeat: new Date().toISOString(),
    });
    return reply.status(201).send(node);
  });

  server.post('/v1/storage-nodes/:id/heartbeat', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const node = db.getStorageNode(id);
    if (!node) return reply.status(404).send({ error: 'Storage node not found' });

    const body = req.body as { usedBytes?: number; availableBytes?: number; status?: 'online' | 'offline' };
    if (body.usedBytes !== undefined) node.usedBytes = body.usedBytes;
    if (body.availableBytes !== undefined) node.availableBytes = body.availableBytes;
    if (body.status) node.status = body.status;
    node.lastHeartbeat = new Date().toISOString();
    db.upsertStorageNode(node);

    broadcastEvent(auth.user.id, {
      type: 'node.heartbeat',
      node: {
        nodeId: node.id,
        deviceId: node.deviceId,
        userId: node.userId,
        allocatedBytes: node.allocatedBytes,
        usedBytes: node.usedBytes,
        availableBytes: node.availableBytes,
        status: node.status,
        lastHeartbeat: node.lastHeartbeat,
      },
    });

    return node;
  });

  // --- Files & Encrypted Manifests ---
  server.get('/v1/files', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    const files = db.getFilesByUser(auth.user.id);
    return files.map(f => ({
      fileId: f.id,
      version: f.version,
      contentHash: f.contentHash,
      totalPlaintextSize: f.totalPlaintextSize,
      totalEncryptedSize: f.totalEncryptedSize,
      encryptedMetadata: f.encryptedMetadata,
      metadataIv: f.metadataIv,
      metadataTag: f.metadataTag,
      wrappedFileKey: JSON.parse(f.wrappedFileKey),
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      chunks: db.getChunksForFile(f.id).map(c => ({
        index: c.chunkIndex,
        hash: c.hash,
        size: c.size,
        iv: c.iv,
        tag: c.tag,
      })),
    }));
  });

  server.get('/v1/files/:id', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const f = db.getFile(id);
    if (!f || f.userId !== auth.user.id) return reply.status(404).send({ error: 'File not found' });

    return {
      fileId: f.id,
      version: f.version,
      contentHash: f.contentHash,
      totalPlaintextSize: f.totalPlaintextSize,
      totalEncryptedSize: f.totalEncryptedSize,
      encryptedMetadata: f.encryptedMetadata,
      metadataIv: f.metadataIv,
      metadataTag: f.metadataTag,
      wrappedFileKey: JSON.parse(f.wrappedFileKey),
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      chunks: db.getChunksForFile(f.id).map(c => ({
        index: c.chunkIndex,
        hash: c.hash,
        size: c.size,
        iv: c.iv,
        tag: c.tag,
      })),
    };
  });

  server.post('/v1/files', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    const manifest = req.body as EncryptedFileManifest;

    db.createFile({
      id: manifest.fileId,
      userId: auth.user.id,
      version: manifest.version,
      contentHash: manifest.contentHash,
      totalPlaintextSize: manifest.totalPlaintextSize,
      totalEncryptedSize: manifest.totalEncryptedSize,
      encryptedMetadata: manifest.encryptedMetadata,
      metadataIv: manifest.metadataIv,
      metadataTag: manifest.metadataTag,
      wrappedFileKey: JSON.stringify(manifest.wrappedFileKey),
      createdAt: manifest.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    for (const chunk of manifest.chunks) {
      db.createChunk({
        id: `${manifest.fileId}-c${chunk.index}`,
        fileId: manifest.fileId,
        chunkIndex: chunk.index,
        hash: chunk.hash,
        size: chunk.size,
        iv: chunk.iv,
        tag: chunk.tag,
      });
    }

    broadcastEvent(auth.user.id, {
      type: 'file.created',
      fileId: manifest.fileId,
      version: manifest.version,
    });

    return reply.status(201).send({ success: true, fileId: manifest.fileId });
  });

  server.delete('/v1/files/:id', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const f = db.getFile(id);
    if (!f || f.userId !== auth.user.id) return reply.status(404).send({ error: 'File not found' });

    // Note: Soft delete or remove file
    return { success: true, fileId: id };
  });

  // --- Uploads & Relay ---
  server.post('/v1/uploads/:id/chunks', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    const { id: fileId } = req.params as { id: string };
    const body = req.body as {
      chunkIndex: number;
      hash: string;
      dataBase64: string;
      iv: string;
      tag: string;
    };

    const chunkData = new Uint8Array(Buffer.from(body.dataBase64, 'base64'));
    const chunkId = `${fileId}-c${body.chunkIndex}`;

    // Verify and store encrypted chunk in storage provider
    const receipt = await storage.put({
      chunkId,
      fileId,
      chunkIndex: body.chunkIndex,
      data: chunkData,
      hash: body.hash,
      size: chunkData.length,
    });

    db.recordLocation({
      id: `loc-${randomUUID().slice(0, 8)}`,
      chunkId,
      storageNodeId: storage.id,
      providerType: 'relay',
      verifiedAt: new Date().toISOString(),
    });

    broadcastEvent(auth.user.id, {
      type: 'chunk.stored',
      fileId,
      chunkIndex: body.chunkIndex,
      hash: body.hash,
      nodeId: storage.id,
    });

    return reply.status(201).send(receipt);
  });

  // --- Downloads ---
  server.get('/v1/downloads/:id/chunks/:chunkIndex', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    const { id: fileId, chunkIndex: indexStr } = req.params as { id: string; chunkIndex: string };
    const chunkIndex = parseInt(indexStr, 10);
    const chunkId = `${fileId}-c${chunkIndex}`;

    const chunk = await storage.get(chunkId);
    return {
      chunkId: chunk.chunkId,
      fileId: chunk.fileId,
      chunkIndex: chunk.chunkIndex,
      hash: chunk.hash,
      dataBase64: Buffer.from(chunk.data).toString('base64'),
    };
  });

  // --- Relay Chunk Envelope ---
  server.post('/v1/sync/relay/chunk', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    const env = req.body as RelayChunkEnvelope;

    const chunkData = new Uint8Array(Buffer.from(env.dataBase64, 'base64'));
    const chunkId = `${env.fileId}-c${env.chunkIndex}`;

    await storage.put({
      chunkId,
      fileId: env.fileId,
      chunkIndex: env.chunkIndex,
      data: chunkData,
      hash: env.hash,
      size: chunkData.length,
    });

    const ack: RelayAck = {
      relaySessionId: env.relaySessionId,
      fileId: env.fileId,
      chunkIndex: env.chunkIndex,
      nodeId: storage.id,
      success: true,
    };
    return ack;
  });

  // --- Recovery Endpoints ---
  server.post('/v1/recovery/setup', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    const body = req.body as { remoteSharePayload: string };
    if (!body?.remoteSharePayload) return reply.status(400).send({ error: 'remoteSharePayload required' });

    db.setRecoveryConfig({
      userId: auth.user.id,
      remoteSharePayload: body.remoteSharePayload,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  });

  server.get('/v1/recovery/restore', async (req, reply) => {
    const auth = await authenticate(req, reply);
    if (!auth) return;
    const config = db.getRecoveryConfig(auth.user.id);
    if (!config) return reply.status(404).send({ error: 'No recovery configuration found' });
    return { remoteSharePayload: config.remoteSharePayload };
  });

  // --- WebSocket Sync Events ---
  server.get('/v1/sync/events', { websocket: true }, (socket, req) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) {
      socket.close(1008, 'Token required');
      return;
    }
    const session = db.getSession(token);
    if (!session) {
      socket.close(1008, 'Invalid token');
      return;
    }
    const userId = session.userId;
    if (!wsConnections.has(userId)) {
      wsConnections.set(userId, new Set());
    }
    wsConnections.get(userId)!.add(socket as any);

    socket.on('close', () => {
      wsConnections.get(userId)?.delete(socket as any);
    });
  });

  return server;
}
