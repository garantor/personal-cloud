import path from 'node:path';
import os from 'node:os';
import { DesktopStorageNode } from './desktop-node.js';

export * from './desktop-node.js';

async function main() {
  const dataDir = process.env.DATA_DIR || path.join(os.homedir(), '.personal-cloud', 'desktop-storage');
  const node = new DesktopStorageNode({
    deviceId: process.env.DEVICE_ID || 'desktop-mac-local',
    userId: process.env.USER_ID || 'user-default',
    storageDir: dataDir,
    allocatedBytes: 500 * 1024 * 1024 * 1024,
  });

  await node.start();
  const info = await node.getInfo();
  console.log(`Desktop Storage Node started.`);
  console.log(`Node ID: ${info.nodeId}`);
  console.log(`Allocated: ${(info.allocatedBytes / (1024 ** 3)).toFixed(1)} GB`);
  console.log(`Status: ${info.status}`);
}

if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
  main().catch(console.error);
}
