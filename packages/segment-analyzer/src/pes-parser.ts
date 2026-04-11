import type { TsPacket } from './ts-parser';

/**
 * Packetized Elementary Stream (PES) header parser.
 * Extracts PTS/DTS timestamps from video/audio PES packets.
 */

export interface PesHeader {
  /** PID this PES was found on */
  pid: number;
  /** Stream ID */
  streamId: number;
  /** PES packet length (0 for video) */
  packetLength: number;
  /** Whether PTS is present */
  hasPts: boolean;
  /** Whether DTS is present */
  hasDts: boolean;
  /** Presentation Time Stamp (in 90kHz units) */
  pts?: number;
  /** Decoding Time Stamp (in 90kHz units) */
  dts?: number;
  /** PTS in seconds */
  ptsSeconds?: number;
  /** DTS in seconds */
  dtsSeconds?: number;
}

/**
 * Parse PES header from a TS packet with PUSI set.
 */
export function parsePesHeader(packet: TsPacket): PesHeader | null {
  if (!packet.pusi || !packet.payload) return null;

  const data = packet.payload;

  // PES start code: 00 00 01
  if (data.length < 9 || data[0] !== 0x00 || data[1] !== 0x00 || data[2] !== 0x01) {
    return null;
  }

  const streamId = data[3];
  const packetLength = (data[4] << 8) | data[5];

  // Only parse audio/video streams (stream IDs 0xC0-0xEF)
  if (streamId < 0xc0 && streamId !== 0xbd) {
    return null;
  }

  // Optional PES header
  if (data.length < 9) return null;

  const ptsDtsFlags = (data[7] >> 6) & 0x03;
  const hasPts = ptsDtsFlags >= 2;
  const hasDts = ptsDtsFlags === 3;

  const header: PesHeader = {
    pid: packet.pid,
    streamId,
    packetLength,
    hasPts,
    hasDts,
  };

  if (hasPts && data.length >= 14) {
    header.pts = parseTimestamp(data, 9);
    header.ptsSeconds = header.pts / 90000;
  }

  if (hasDts && data.length >= 19) {
    header.dts = parseTimestamp(data, 14);
    header.dtsSeconds = header.dts / 90000;
  }

  return header;
}

/**
 * Parse a 33-bit timestamp from a PES header.
 * Timestamps are encoded in 5 bytes with marker bits.
 */
function parseTimestamp(data: Buffer, offset: number): number {
  const byte0 = data[offset];
  const byte1 = data[offset + 1];
  const byte2 = data[offset + 2];
  const byte3 = data[offset + 3];
  const byte4 = data[offset + 4];

  // 33-bit timestamp spread across 5 bytes with marker bits
  const ts =
    ((byte0 >> 1) & 0x07) * 0x100000000 + // bits 32-30
    byte1 * 0x02000000 + // bits 29-22
    (byte2 >> 1) * 0x020000 + // bits 21-15
    byte3 * 0x0200 + // bits 14-7
    (byte4 >> 1); // bits 6-0

  return ts;
}

/**
 * Extract all PES headers from TS packets for given PIDs.
 */
export function findPesHeaders(packets: TsPacket[], pids?: number[]): PesHeader[] {
  const headers: PesHeader[] = [];

  for (const pkt of packets) {
    if (pids && !pids.includes(pkt.pid)) continue;
    if (!pkt.pusi) continue;

    const pes = parsePesHeader(pkt);
    if (pes) {
      headers.push(pes);
    }
  }

  return headers;
}
