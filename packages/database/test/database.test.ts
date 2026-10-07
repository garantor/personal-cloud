import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudDatabase } from '../src/index.js';

test('Database: User, device lifecycle and device revocation', () => {
  const db = new CloudDatabase();

  const user = db.createUser({
    id: 'user-1',
    email: 'user@example.com',
    createdAt: new Date().toISOString(),
  });
  assert.equal(db.getUser('user-1')?.email, 'user@example.com');
  assert.equal(db.getUserByEmail('USER@EXAMPLE.COM')?.id, 'user-1');

  const device = db.createDevice({
    id: 'device-1',
    userId: 'user-1',
    name: 'iPhone 15',
    type: 'mobile_ios',
    publicKey: 'ed25519-mock-pub',
    isRevoked: false,
    lastSeenAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  const session = db.createSession({
    id: 'sess-1',
    userId: 'user-1',
    deviceId: 'device-1',
    token: 'auth-token-1234',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });

  assert.ok(db.getSession('auth-token-1234'));

  // Revoke device
  const revoked = db.revokeDevice('device-1');
  assert.equal(revoked, true);
  assert.equal(db.getDevice('device-1')?.isRevoked, true);
  // Session must be purged
  assert.equal(db.getSession('auth-token-1234'), undefined);
});

test('Database: File, Chunk, and Recovery configuration records contain no plaintext', () => {
  const db = new CloudDatabase();

  db.createFile({
    id: 'file-10',
    userId: 'user-1',
    version: 1,
    contentHash: 'sha256-hash',
    totalPlaintextSize: 1024,
    totalEncryptedSize: 1040,
    encryptedMetadata: 'base64-enc-meta',
    metadataIv: 'iv-base64',
    metadataTag: 'tag-base64',
    wrappedFileKey: '{"wrappedKey":"abc"}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const file = db.getFile('file-10');
  assert.ok(file);
  assert.equal(file.encryptedMetadata, 'base64-enc-meta');

  db.setRecoveryConfig({
    userId: 'user-1',
    remoteSharePayload: 'base64-remote-share',
    updatedAt: new Date().toISOString(),
  });

  const rec = db.getRecoveryConfig('user-1');
  assert.equal(rec?.remoteSharePayload, 'base64-remote-share');
});
