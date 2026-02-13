/**
 * MPEG Transport Stream packet parser.
 * TS packets are always 188 bytes (or 192/204 with adaptation).
 */

export const TS_PACKET_SIZE = 188;
export const TS_SYNC_BYTE = 0x47;

export interface TsPacket {
  /** Offset in the file where this packet starts */
  offset: number;
  /** Sync byte (should be 0x47) */
  syncByte: number;
  /** Transport error indicator */
  tei: boolean;
  /** Payload unit start indicator */
  pusi: boolean;
  /** Transport priority */
  priority: boolean;
  /** Packet Identifier (13 bits) */
  pid: number;
  /** Transport scrambling control */
  scrambling: number;
  /** Adaptation field control */
  adaptationFieldControl: number;
  /** Continuity counter (4 bits) */
  continuityCounter: number;
  /** Adaptation field data (if present) */
  adaptationField?: AdaptationField;
  /** Payload data */
  payload?: Buffer;
}

export interface AdaptationField {
  /** Field length */
  length: number;
  /** Discontinuity indicator */
  discontinuity: boolean;
  /** Random access indicator */
  randomAccess: boolean;
  /** PCR flag */
  pcrFlag: boolean;
  /** PCR value (if present, in 90kHz units) */
  pcr?: number;
}

/**
 * Parse all TS packets from a buffer.
 */
export function parseTsPackets(data: Buffer): TsPacket[] {
  const packets: TsPacket[] = [];

  // Find initial sync
  let offset = findSyncOffset(data);
  if (offset < 0) return packets;

  while (offset + TS_PACKET_SIZE <= data.length) {
    if (data[offset] !== TS_SYNC_BYTE) {
      // Lost sync, try to find it again
      offset = findSyncOffset(data, offset + 1);
      if (offset < 0) break;
      continue;
    }

    const packet = parsePacket(data, offset);
    packets.push(packet);
    offset += TS_PACKET_SIZE;
  }

  return packets;
}

/**
 * Find the offset of the first sync byte that has consistent 188-byte spacing.
 */
function findSyncOffset(data: Buffer, start = 0): number {
  for (let i = start; i < data.length - TS_PACKET_SIZE; i++) {
    if (data[i] === TS_SYNC_BYTE) {
      // Verify next packet sync
      if (i + TS_PACKET_SIZE < data.length && data[i + TS_PACKET_SIZE] === TS_SYNC_BYTE) {
        return i;
      }
    }
  }
  return -1;
}

function parsePacket(data: Buffer, offset: number): TsPacket {
  const byte1 = data[offset + 1];
  const byte2 = data[offset + 2];
  const byte3 = data[offset + 3];

  const tei = !!(byte1 & 0x80);
  const pusi = !!(byte1 & 0x40);
  const priority = !!(byte1 & 0x20);
  const pid = ((byte1 & 0x1f) << 8) | byte2;
  const scrambling = (byte3 >> 6) & 0x03;
  const adaptationFieldControl = (byte3 >> 4) & 0x03;
  const continuityCounter = byte3 & 0x0f;

  const packet: TsPacket = {
    offset,
    syncByte: data[offset],
    tei,
    pusi,
    priority,
    pid,
    scrambling,
    adaptationFieldControl,
    continuityCounter,
  };

  let payloadStart = offset + 4;

  // Parse adaptation field if present
  if (adaptationFieldControl === 2 || adaptationFieldControl === 3) {
    const afLength = data[payloadStart];
    packet.adaptationField = parseAdaptationField(data, payloadStart);
    payloadStart += 1 + afLength;
  }

  // Extract payload if present
  if (adaptationFieldControl === 1 || adaptationFieldControl === 3) {
    if (payloadStart < offset + TS_PACKET_SIZE) {
      packet.payload = data.subarray(payloadStart, offset + TS_PACKET_SIZE);
    }
  }

  return packet;
}

function parseAdaptationField(data: Buffer, offset: number): AdaptationField {
  const length = data[offset];
  const af: AdaptationField = {
    length,
    discontinuity: false,
    randomAccess: false,
    pcrFlag: false,
  };

  if (length > 0) {
    const flags = data[offset + 1];
    af.discontinuity = !!(flags & 0x80);
    af.randomAccess = !!(flags & 0x40);
    af.pcrFlag = !!(flags & 0x10);

    if (af.pcrFlag && length >= 7) {
      // PCR is 33 bits base + 9 bits extension
      const base =
        (data[offset + 2] * 0x02000000) +
        (data[offset + 3] * 0x020000) +
        (data[offset + 4] * 0x0200) +
        (data[offset + 5] * 0x02) +
        ((data[offset + 6] >> 7) & 0x01);
      af.pcr = base;
    }
  }

  return af;
}

/**
 * Get summary statistics for a parsed TS file.
 */
export function getTsSummary(packets: TsPacket[]): TsSummary {
  const pidCounts = new Map<number, number>();
  let discontinuities = 0;
  let pcrValues: { pid: number; pcr: number }[] = [];

  for (const pkt of packets) {
    pidCounts.set(pkt.pid, (pidCounts.get(pkt.pid) ?? 0) + 1);
    if (pkt.adaptationField?.discontinuity) discontinuities++;
    if (pkt.adaptationField?.pcr != null) {
      pcrValues.push({ pid: pkt.pid, pcr: pkt.adaptationField.pcr });
    }
  }

  return {
    totalPackets: packets.length,
    totalBytes: packets.length * TS_PACKET_SIZE,
    pidCounts: Object.fromEntries(pidCounts),
    discontinuities,
    pcrValues,
  };
}

export interface TsSummary {
  totalPackets: number;
  totalBytes: number;
  pidCounts: Record<number, number>;
  discontinuities: number;
  pcrValues: { pid: number; pcr: number }[];
}
