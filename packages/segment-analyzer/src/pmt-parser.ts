import type { TsPacket } from './ts-parser';

/**
 * Program Map Table (PMT) parser.
 * PMT describes the elementary streams (video, audio) for a program.
 */

export interface PmtStream {
  /** Stream type (0x1B = H.264, 0x0F = AAC, etc.) */
  streamType: number;
  /** Stream type name */
  streamTypeName: string;
  /** Elementary PID */
  elementaryPid: number;
  /** Descriptors (raw) */
  descriptorLength: number;
}

export interface Pmt {
  /** Program number */
  programNumber: number;
  /** Version number */
  version: number;
  /** PCR PID */
  pcrPid: number;
  /** Elementary streams */
  streams: PmtStream[];
}

/** Common stream type codes */
const STREAM_TYPES: Record<number, string> = {
  0x01: 'MPEG-1 Video',
  0x02: 'MPEG-2 Video',
  0x03: 'MPEG-1 Audio',
  0x04: 'MPEG-2 Audio',
  0x0f: 'AAC Audio',
  0x11: 'AAC-LATM Audio',
  0x1b: 'H.264/AVC Video',
  0x24: 'H.265/HEVC Video',
  0x42: 'Chinese Video',
  0x81: 'AC-3 Audio',
  0x87: 'E-AC-3 Audio',
};

/**
 * Parse a PMT from a TS packet.
 */
export function parsePmt(packet: TsPacket, expectedPid: number): Pmt | null {
  if (packet.pid !== expectedPid || !packet.payload) return null;

  const data = packet.payload;
  let offset = 0;

  if (packet.pusi) {
    const pointer = data[0];
    offset = 1 + pointer;
  }

  // Table ID should be 0x02 for PMT
  const tableId = data[offset];
  if (tableId !== 0x02) return null;

  const sectionLength = ((data[offset + 1] & 0x0f) << 8) | data[offset + 2];
  const programNumber = (data[offset + 3] << 8) | data[offset + 4];
  const version = (data[offset + 5] >> 1) & 0x1f;
  const pcrPid = ((data[offset + 8] & 0x1f) << 8) | data[offset + 9];
  const programInfoLength = ((data[offset + 10] & 0x0f) << 8) | data[offset + 11];

  // Elementary stream entries start after program info
  const streamsStart = offset + 12 + programInfoLength;
  const sectionEnd = offset + 3 + sectionLength - 4; // -4 for CRC
  const streams: PmtStream[] = [];

  let i = streamsStart;
  while (i + 4 < sectionEnd && i + 4 < data.length) {
    const streamType = data[i];
    const elementaryPid = ((data[i + 1] & 0x1f) << 8) | data[i + 2];
    const esInfoLength = ((data[i + 3] & 0x0f) << 8) | data[i + 4];

    streams.push({
      streamType,
      streamTypeName: STREAM_TYPES[streamType] ?? `Unknown (0x${streamType.toString(16)})`,
      elementaryPid,
      descriptorLength: esInfoLength,
    });

    i += 5 + esInfoLength;
  }

  return { programNumber, version, pcrPid, streams };
}

/**
 * Find and parse the PMT for a given PID from TS packets.
 */
export function findPmt(packets: TsPacket[], pmtPid: number): Pmt | null {
  for (const pkt of packets) {
    if (pkt.pid === pmtPid && pkt.pusi) {
      const pmt = parsePmt(pkt, pmtPid);
      if (pmt) return pmt;
    }
  }
  return null;
}
