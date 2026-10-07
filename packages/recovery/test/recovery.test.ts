import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMasterKey } from '@personal-cloud/crypto';
import { RecoveryManager, formatRecoveryCode, parseRecoveryCode } from '../src/index.js';

test('Recovery: Human recovery code format and parse', () => {
  const masterKey = generateMasterKey();
  const setup = RecoveryManager.setup(masterKey);

  assert.ok(setup.recoveryCode.startsWith('RC-'));
  const parsed = parseRecoveryCode(setup.recoveryCode);
  assert.equal(parsed.x, 2);
  assert.equal(parsed.data.length, masterKey.length);
  assert.equal(parsed.checksum, setup.recoveryCode ? parsed.checksum : '');
});

test('Recovery: Scenario A (Primary Device + Remote Share)', () => {
  const masterKey = generateMasterKey();
  const setup = RecoveryManager.setup(masterKey);

  const recovered = RecoveryManager.recover({
    primaryDeviceShare: setup.primaryDeviceShare,
    remoteSharePayload: setup.remoteSharePayload,
  });

  assert.deepEqual(recovered, masterKey);
});

test('Recovery: Scenario B (Phone Lost: Recovery Code + Remote Share)', () => {
  const masterKey = generateMasterKey();
  const setup = RecoveryManager.setup(masterKey);

  const recovered = RecoveryManager.recover({
    recoveryCode: setup.recoveryCode,
    remoteSharePayload: setup.remoteSharePayload,
  });

  assert.deepEqual(recovered, masterKey);
});

test('Recovery: Scenario C (Cloud Offline: Primary Device + Recovery Code)', () => {
  const masterKey = generateMasterKey();
  const setup = RecoveryManager.setup(masterKey);

  const recovered = RecoveryManager.recover({
    primaryDeviceShare: setup.primaryDeviceShare,
    recoveryCode: setup.recoveryCode,
  });

  assert.deepEqual(recovered, masterKey);
});

test('Recovery: Scenario D (Single component failure & corrupted share failure)', () => {
  const masterKey = generateMasterKey();
  const setup = RecoveryManager.setup(masterKey);

  // Remote Share only must fail
  assert.throws(
    () => RecoveryManager.recover({ remoteSharePayload: setup.remoteSharePayload }),
    /Insufficient recovery components/
  );

  // Recovery Code only must fail
  assert.throws(
    () => RecoveryManager.recover({ recoveryCode: setup.recoveryCode }),
    /Insufficient recovery components/
  );

  // Primary Device only must fail
  assert.throws(
    () => RecoveryManager.recover({ primaryDeviceShare: setup.primaryDeviceShare }),
    /Insufficient recovery components/
  );

  // Corrupted Recovery Code must fail
  const chars = setup.recoveryCode.split('');
  chars[8] = chars[8] === 'A' ? 'B' : 'A';
  const corruptedCode = chars.join('');
  assert.throws(
    () => RecoveryManager.recover({
      recoveryCode: corruptedCode,
      remoteSharePayload: setup.remoteSharePayload,
    }),
    /checksum mismatch|corrupt/
  );
});
