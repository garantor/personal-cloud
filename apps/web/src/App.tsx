import React, { useState } from 'react';
import {
  generateMasterKey,
  deriveKEK,
  deriveMetadataKey,
  generateFileKey,
  wrapFileKey,
  unwrapFileKey,
  encryptChunk,
  decryptChunk,
  BrowserRecoveryManager
} from './browser-crypto.js';

interface FileItem {
  id: string;
  name: string;
  sizeStr: string;
  dateStr: string;
  type: 'image' | 'video' | 'doc';
  durability: 'LOCAL_ONLY' | 'SYNCED_TO_DEVICE' | 'MULTIPLE_REPLICAS';
  thumbnailUrl: string;
  encryptedBytes: Uint8Array;
  wrappedKey: any;
  iv: string;
  tag: string;
  hash: string;
}

export function App() {
  const [activeTab, setActiveTab] = useState<'photos' | 'storage' | 'devices' | 'recovery' | 'settings'>('photos');

  // Master key generated locally in browser
  const [masterKey] = useState<Uint8Array>(() => generateMasterKey());
  const kek = deriveKEK(masterKey);
  const metaKey = deriveMetadataKey(masterKey);

  // Recovery Setup
  const [recoveryData] = useState(() => BrowserRecoveryManager.setup(masterKey));
  const [recoverInputCode, setRecoverInputCode] = useState('');
  const [recoveryStatusMessage, setRecoveryStatusMessage] = useState<string | null>(null);

  // Storage node status
  const [allocatedGb, setAllocatedGb] = useState(500);
  const [rentGb, setRentGb] = useState(150);

  // Devices
  const [devices, setDevices] = useState([
    { id: 'dev-1', name: 'iPhone 15 Pro', type: 'mobile_ios', status: 'Online', lastSync: 'Just now' },
    { id: 'dev-2', name: 'MacBook Pro M3', type: 'desktop_mac', status: 'Online (Storage Node)', lastSync: '1 min ago' },
    { id: 'dev-3', name: 'Web Browser Client', type: 'web', status: 'Active Session', lastSync: 'Active' },
  ]);

  // Gallery items (Client-side encrypted)
  const [files, setFiles] = useState<FileItem[]>(() => {
    const sampleFiles = [
      { name: 'sunset_beach_2026.jpg', size: '3.4 MB', date: 'Oct 6, 2026', type: 'image' as const, thumb: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&q=80' },
      { name: 'family_cabin_weekend.jpg', size: '4.8 MB', date: 'Oct 5, 2026', type: 'image' as const, thumb: 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=500&q=80' },
      { name: 'drone_mountains_4k.mp4', size: '142.0 MB', date: 'Oct 4, 2026', type: 'video' as const, thumb: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=500&q=80' },
      { name: 'passport_scan_verified.jpg', size: '1.2 MB', date: 'Sep 28, 2026', type: 'image' as const, thumb: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=500&q=80' },
    ];

    return sampleFiles.map((f, idx) => {
      const fileId = `file-${idx + 1}`;
      const fKey = generateFileKey();
      const wrapped = wrapFileKey(kek, fKey);
      const plaintextPayload = new TextEncoder().encode(`Plaintext contents for ${f.name}`);
      const encChunk = encryptChunk(fKey, 0, plaintextPayload, fileId);

      return {
        id: fileId,
        name: f.name,
        sizeStr: f.size,
        dateStr: f.date,
        type: f.type,
        durability: 'MULTIPLE_REPLICAS',
        thumbnailUrl: f.thumb,
        encryptedBytes: encChunk.ciphertext,
        wrappedKey: wrapped,
        iv: encChunk.iv,
        tag: encChunk.tag,
        hash: encChunk.hash,
      };
    });
  });

  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // Browser-side decryption demonstration
  const handleDecryptAndDownload = (file: FileItem) => {
    try {
      // 1. Unwrap file key in browser using local KEK
      const unwrappedKey = unwrapFileKey(kek, file.wrappedKey);
      // 2. Decrypt chunk in browser
      const decrypted = decryptChunk(unwrappedKey, 0, file.encryptedBytes, file.iv, file.tag, file.id);
      const text = new TextDecoder().decode(decrypted);
      showNotification(`✓ Verified & Decrypted locally: "${file.name}" (Zero-knowledge authenticated)`);
    } catch (err) {
      showNotification(`Decryption error: ${(err as Error).message}`);
    }
  };

  // Revoke device
  const handleRevokeDevice = (deviceId: string) => {
    setDevices(prev => prev.filter(d => d.id !== deviceId));
    showNotification(`Device ${deviceId} revoked from personal cloud.`);
  };

  // Recovery attempt
  const handleTestRecovery = () => {
    try {
      if (!recoverInputCode.trim()) {
        setRecoveryStatusMessage('Please enter a recovery code.');
        return;
      }
      const recoveredKey = BrowserRecoveryManager.recover({
        recoveryCode: recoverInputCode.trim(),
        remoteSharePayload: recoveryData.remoteSharePayload,
      });

      const isMatch = recoveredKey.length === masterKey.length &&
        recoveredKey.every((byte, idx) => byte === masterKey[idx]);

      if (isMatch) {
        setRecoveryStatusMessage('✓ Recovery successful! Master key reconstructed from Recovery Code + Remote Share.');
        showNotification('Master Key reconstructed successfully!');
      } else {
        setRecoveryStatusMessage('Recovery failed: key mismatch.');
      }
    } catch (err) {
      setRecoveryStatusMessage(`Recovery failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="app-root">
      {/* Navbar */}
      <header className="app-header">
        <a href="#" className="brand" id="brand-logo">
          <div className="brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            </svg>
          </div>
          <span className="brand-title">Personal Cloud</span>
        </a>

        <nav className="nav-tabs" aria-label="Main Navigation">
          <button
            id="tab-photos"
            className={`nav-tab-btn ${activeTab === 'photos' ? 'active' : ''}`}
            onClick={() => setActiveTab('photos')}
          >
            Photos & Files
          </button>
          <button
            id="tab-storage"
            className={`nav-tab-btn ${activeTab === 'storage' ? 'active' : ''}`}
            onClick={() => setActiveTab('storage')}
          >
            Storage Nodes
          </button>
          <button
            id="tab-devices"
            className={`nav-tab-btn ${activeTab === 'devices' ? 'active' : ''}`}
            onClick={() => setActiveTab('devices')}
          >
            Devices ({devices.length})
          </button>
          <button
            id="tab-recovery"
            className={`nav-tab-btn ${activeTab === 'recovery' ? 'active' : ''}`}
            onClick={() => setActiveTab('recovery')}
          >
            2-of-3 Recovery
          </button>
          <button
            id="tab-settings"
            className={`nav-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </nav>

        <div className="auth-badge" id="auth-status-indicator">
          <div className="auth-pulse"></div>
          <span>Zero-Knowledge Active</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="main-container">
        {notification && (
          <div style={{
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid var(--accent-cyan)',
            padding: '0.8rem 1.2rem',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1.5rem',
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>{notification}</span>
            <button onClick={() => setNotification(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* Hero Banner */}
        <section className="hero-banner" aria-labelledby="hero-title">
          <div>
            <h1 id="hero-title" className="hero-title">Your Sovereign Personal Cloud</h1>
            <p className="hero-subtitle">
              Your phone takes the photo. Your personal devices store it. The network backs it up.
              Zero-knowledge encryption protects your memories before they leave your device.
            </p>
          </div>
          <div className="storage-pill-stat">
            <div className="stat-value">500 GB</div>
            <div className="stat-label">Allocated to Personal Node</div>
          </div>
        </section>

        {/* Tab 1: Photos & Files */}
        {activeTab === 'photos' && (
          <section id="section-photos">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2>Media Library & Backup Gallery</h2>
              <button
                id="btn-simulate-upload"
                className="btn btn-primary"
                onClick={() => {
                  const newIdx = files.length + 1;
                  const newFileId = `file-${newIdx}`;
                  const fKey = generateFileKey();
                  const wrapped = wrapFileKey(kek, fKey);
                  const data = new TextEncoder().encode(`New photo data ${newIdx}`);
                  const encChunk = encryptChunk(fKey, 0, data, newFileId);

                  const newItem: FileItem = {
                    id: newFileId,
                    name: `IMG_${20261000 + newIdx}.jpg`,
                    sizeStr: '3.6 MB',
                    dateStr: 'Just now',
                    type: 'image',
                    durability: 'MULTIPLE_REPLICAS',
                    thumbnailUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=500&q=80',
                    encryptedBytes: encChunk.ciphertext,
                    wrappedKey: wrapped,
                    iv: encChunk.iv,
                    tag: encChunk.tag,
                    hash: encChunk.hash,
                  };
                  setFiles(prev => [newItem, ...prev]);
                  showNotification(`Photo ${newItem.name} automatically encrypted & backed up.`);
                }}
              >
                + Simulate New Photo Backup
              </button>
            </div>

            <div className="gallery-grid" id="gallery-container">
              {files.map(file => (
                <article key={file.id} className="photo-card" id={`card-${file.id}`}>
                  <div className="photo-preview">
                    <img src={file.thumbnailUrl} alt={file.name} className="photo-img" loading="lazy" />
                    <div className="crypto-badge">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      Encrypted
                    </div>
                  </div>
                  <div className="card-info">
                    <div className="file-name" title={file.name}>{file.name}</div>
                    <div className="file-meta">
                      <span>{file.sizeStr}</span>
                      <span>{file.dateStr}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ flex: 1, padding: '0.4rem', fontSize: '0.78rem' }}
                        onClick={() => handleDecryptAndDownload(file)}
                      >
                        Client Decrypt
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Tab 2: Storage Nodes */}
        {activeTab === 'storage' && (
          <section id="section-storage">
            <div className="card-panel">
              <h2 className="panel-title">Personal Storage Node (MacBook Pro)</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', margin: '1.5rem 0' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                  <div className="stat-label">Total Allocated</div>
                  <div className="stat-value">{allocatedGb} GB</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                  <div className="stat-label">Used by Personal Cloud</div>
                  <div className="stat-value" style={{ color: 'var(--accent-emerald)' }}>142 GB</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                  <div className="stat-label">Available Capacity</div>
                  <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{allocatedGb - 142} GB</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                  <div className="stat-label">Node Status</div>
                  <div className="stat-value" style={{ color: 'var(--accent-emerald)', fontSize: '1.4rem' }}>Online & Healthy</div>
                </div>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <label style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>Configure Storage Capacity Allocation (GB):</label>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="range"
                    min="100"
                    max="2000"
                    step="50"
                    value={allocatedGb}
                    onChange={e => setAllocatedGb(Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontWeight: 600 }}>{allocatedGb} GB</span>
                </div>
              </div>
            </div>

            {/* Storage Marketplace Panel */}
            <div className="card-panel">
              <h2 className="panel-title">Storage Marketplace — Rent Unused Space</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Monetize your spare disk capacity. Marketplace storage nodes only ever receive ciphertext chunks
                and have zero access to customer data or keys.
              </p>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Capacity to rent out:</label>
                  <input
                    type="number"
                    className="text-input"
                    value={rentGb}
                    onChange={e => setRentGb(Number(e.target.value))}
                    style={{ marginTop: '0.3rem' }}
                  />
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.9rem 1.5rem', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div className="stat-label">Estimated Rewards</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                    ${(rentGb * 0.005).toFixed(2)}/mo
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => showNotification(`Renting ${rentGb} GB registered to storage marketplace!`)}
                >
                  Start Earning
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Tab 3: Devices */}
        {activeTab === 'devices' && (
          <section id="section-devices">
            <div className="card-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 className="panel-title">Connected Trusted Devices</h2>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const newDev = {
                      id: `dev-${devices.length + 1}`,
                      name: `iPad Pro (${devices.length + 1})`,
                      type: 'mobile_ios',
                      status: 'Online',
                      lastSync: 'Just now'
                    };
                    setDevices(prev => [...prev, newDev]);
                    showNotification(`New device "${newDev.name}" registered with Ed25519 identity.`);
                  }}
                >
                  + Pair New Device
                </button>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Device Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Last Seen</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map(d => (
                    <tr key={d.id} id={`row-${d.id}`}>
                      <td style={{ fontWeight: 600 }}>{d.name}</td>
                      <td>{d.type}</td>
                      <td>
                        <span style={{ color: 'var(--accent-emerald)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ width: '6px', height: '6px', background: 'var(--accent-emerald)', borderRadius: '50%' }}></span>
                          {d.status}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{d.lastSync}</td>
                      <td>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                          onClick={() => handleRevokeDevice(d.id)}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Tab 4: 2-of-3 Recovery */}
        {activeTab === 'recovery' && (
          <section id="section-recovery">
            <div className="card-panel">
              <h2 className="panel-title">2-of-3 Shamir Secret Sharing Recovery</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Your master encryption key is split into 3 parts. Any 2 parts can restore your entire personal cloud,
                even if your primary phone is lost or destroyed. A single share alone reveals 0 bits of information.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>Share A: Primary Device</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                    Stored securely in your phone's iOS Keychain / Android Keystore.
                  </div>
                  <div style={{ marginTop: '0.8rem', fontSize: '0.8rem', color: 'var(--accent-emerald)' }}>✓ Active on Device</div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>Share B: Recovery Code</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                    Your human-friendly emergency code. Keep it safe in a password manager.
                  </div>
                  <div style={{ marginTop: '0.8rem', fontSize: '0.8rem', color: 'var(--accent-emerald)' }}>✓ Generated</div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>Share C: Remote Share</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                    Blinded share stored on the backend relay. Cannot decrypt anything by itself.
                  </div>
                  <div style={{ marginTop: '0.8rem', fontSize: '0.8rem', color: 'var(--accent-emerald)' }}>✓ Stored on Relay</div>
                </div>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Your Human Recovery Credential (Share B):</label>
                <div className="recovery-box" id="recovery-code-display">
                  {recoveryData.recoveryCode}
                </div>
              </div>

              {/* Lost phone recovery tester */}
              <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem' }}>
                <h3>Test Lost-Phone Account Recovery</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.4rem 0 1rem 0' }}>
                  Simulate recovering your account on a brand new phone using your Recovery Code + Remote Share:
                </p>
                <div style={{ display: 'flex', gap: '0.8rem' }}>
                  <input
                    type="text"
                    id="input-recovery-code"
                    className="text-input"
                    placeholder="Enter Recovery Code (RC-...)"
                    value={recoverInputCode}
                    onChange={e => setRecoverInputCode(e.target.value)}
                  />
                  <button
                    id="btn-recover-account"
                    className="btn btn-primary"
                    onClick={handleTestRecovery}
                  >
                    Restore Cloud
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setRecoverInputCode(recoveryData.recoveryCode)}
                  >
                    Paste Generated Code
                  </button>
                </div>
                {recoveryStatusMessage && (
                  <div style={{
                    marginTop: '0.8rem',
                    fontSize: '0.9rem',
                    color: recoveryStatusMessage.startsWith('✓') ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                  }}>
                    {recoveryStatusMessage}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Tab 5: Settings */}
        {activeTab === 'settings' && (
          <section id="section-settings">
            <div className="card-panel">
              <h2 className="panel-title">Network & Sync Policies</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked />
                  <span>Wi-Fi Only (Pause backup when on cellular data)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                  <input type="checkbox" />
                  <span>Charging Only (Only backup when device is plugged into power)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked />
                  <span>Automatic background backup for Photos & Videos</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked />
                  <span>Reserve minimum 20% free disk on desktop storage node</span>
                </label>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
