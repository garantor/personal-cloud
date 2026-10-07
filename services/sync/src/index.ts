import type { SyncEvent, RelayChunkEnvelope, RelayAck } from '@personal-cloud/protocol';

export class SyncCoordinatorService {
  private activeRelays = new Map<string, RelayChunkEnvelope[]>();

  enqueueRelayChunk(envelope: RelayChunkEnvelope): RelayAck {
    const list = this.activeRelays.get(envelope.relaySessionId) || [];
    list.push(envelope);
    this.activeRelays.set(envelope.relaySessionId, list);

    return {
      relaySessionId: envelope.relaySessionId,
      fileId: envelope.fileId,
      chunkIndex: envelope.chunkIndex,
      nodeId: envelope.recipientNodeId,
      success: true,
    };
  }

  getRelayedChunks(sessionId: string): RelayChunkEnvelope[] {
    return this.activeRelays.get(sessionId) || [];
  }
}
