import { spawnSync } from 'node:child_process';

const testFiles = [
  'packages/crypto/test/crypto.test.ts',
  'packages/file-manifest/test/manifest.test.ts',
  'packages/storage/test/storage.test.ts',
  'packages/sync-engine/test/sync-engine.test.ts',
  'packages/recovery/test/recovery.test.ts',
  'packages/database/test/database.test.ts',
  'packages/blockchain/test/blockchain.test.ts',
  'services/api/test/api.test.ts',
  'apps/desktop/test/desktop.test.ts',
  'apps/mobile/test/mobile.test.ts',
];

console.log('====================================================');
console.log('🚀 RUNNING ALL PERSONAL CLOUD TEST SUITES');
console.log('====================================================\n');

let allPassed = true;

for (const file of testFiles) {
  process.stdout.write(`Testing ${file} ... `);
  const result = spawnSync('npx', ['tsx', file], { stdio: 'pipe', encoding: 'utf8' });

  if (result.status === 0) {
    console.log('✅ PASSED');
  } else {
    console.log('❌ FAILED\n');
    console.error(result.stdout);
    console.error(result.stderr);
    allPassed = false;
  }
}

console.log('\n====================================================');
if (allPassed) {
  console.log('🎉 ALL TEST SUITES PASSED CLEANLY (10/10)');
} else {
  console.error('💥 SOME TEST SUITES FAILED');
  process.exit(1);
}
console.log('====================================================\n');
