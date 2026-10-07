# Recovery Design: 2-of-3 Shamir Secret Sharing

## 1. Overview & Threat Model

If a user loses their phone, their encrypted data must not be permanently lost. However, the backend must not hold the master key.
We solve this with a **2-of-3 Shamir Secret Sharing (SSS)** scheme over $GF(2^8)$:

```
                     MASTER KEY (256 bits)
                               │
                               ▼
                        Shamir 2-of-3
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
            Share A         Share B         Share C
        (Primary Device) (Recovery Code) (Remote Share)
```

## 2. Share Allocation

| Component | Share Index | Storage Medium | Protection |
|---|---|---|---|
| **Share A** (Primary Device) | 1 | iOS Keychain / Android Keystore / Secure Enclave | Biometric / OS Keystore |
| **Share B** (User Recovery Credential) | 2 | Exported as human-readable mnemonic / recovery code | Written down / Password Manager |
| **Share C** (Remote Backup Share) | 3 | Blinded & stored on the personal cloud backend | Guarded by user account auth & rate limits |

## 3. Human-Friendly Recovery Code Format
- Raw Shamir share bytes are base32/hex encoded with an alphanumeric prefix and checksum:
  `RC-7X9B-K4M2-99FA-W103-88ZP-Q994`
- Easy for the user to write down, print, or store in a password manager.
- The UI never exposes cryptographic jargon like "Galois field" or "Shamir polynomial".

## 4. Recovery Scenarios

### Scenario A: Normal Operation
- Primary Device holds Share A in Keychain.
- If re-authentication or key refresh is needed: Share A + remote Share C reconstructs Master Key seamlessly.

### Scenario B: Phone Lost or Destroyed
1. User installs Personal Cloud app on a new phone.
2. User authenticates with their account (Passkey / credential).
3. Backend releases the encrypted Remote Share C.
4. User enters their Recovery Code (Share B).
5. App reconstructs Master Key locally: `Reconstruct(Share B, Share C) -> Master Key`.
6. App stores the reconstructed key into the new device Keychain (re-generating a fresh Share A for the new device and rotating the remote Share C).
7. All encrypted photos and files are recovered and decrypted locally.

### Scenario C: Cloud Service Temporarily Offline
- Primary device (Share A) + Recovery Code (Share B) allows local export or peer-to-peer sync without contacting the backend.

### Scenario D: Compromised Backend / Attacker Access
- Attacker has only Share C.
- With $k=2$ threshold, a single share reveals **0 bits of information** about the Master Key.
- User files remain completely safe.
