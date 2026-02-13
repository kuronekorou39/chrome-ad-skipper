import type { TsPacket } from './ts-parser';

/**
 * Program Association Table (PAT) parser.
 * PAT is always on PID 0 and maps program numbers to PMT PIDs.
 */

export const PAT_PID = 0x0000;

export interface PatEntry {
  /** Program number (0 = NIT) */
  programNumber: number;
  /** PID of the PMT for this program */
  pmtPid: number;
}

export interface Pat {
  /** Transport stream ID */
  transportStreamId: number;
  /** Version number */
  version: number;
  /** Current/next indicator */
  currentNext: boolean;
  /** Program entries */
  programs: PatEntry[];
}

/**
 * Parse a PAT from a TS packet with PUSI set.
 */
export function parsePat(packet: TsPacket): Pat | null {
  if (packet.pid !== PAT_PID || !packet.payload) return null;

  const data = packet.payload;
  let offset = 0;

  // If PUSI, first byte is pointer field
  if (packet.pusi) {
    const pointer = data[0];
    offset = 1 + pointer;
  }

  // Table ID should be 0x00 for PAT
  const tableId = data[offset];
  if (tableId !== 0x00) return null;

  const sectionLength = ((data[offset + 1] & 0x0f) << 8) | data[offset + 2];
  const transportStreamId = (data[offset + 3] << 8) | data[offset + 4];
  const version = (data[offset + 5] >> 1) & 0x1f;
  const currentNext = !!(data[offset + 5] & 0x01);

  // Programs start at offset + 8, each entry is 4 bytes
  // Section length includes: tsid(2) + version(1) + section(1) + lastSection(1) + CRC(4) = 9 overhead
  const programsEnd = offset + 3 + sectionLength - 4; // -4 for CRC
  const programs: PatEntry[] = [];

  for (let i = offset + 8; i + 3 < programsEnd && i + 3 < data.length; i += 4) {
    const programNumber = (data[i] << 8) | data[i + 1];
    const pmtPid = ((data[i + 2] & 0x1f) << 8) | data[i + 3];
    programs.push({ programNumber, pmtPid });
  }

  return { transportStreamId, version, currentNext, programs };
}

/**
 * Find and parse all PAT entries from TS packets.
 */
export function findPat(packets: TsPacket[]): Pat | null {
  for (const pkt of packets) {
    if (pkt.pid === PAT_PID && pkt.pusi) {
      const pat = parsePat(pkt);
      if (pat) return pat;
    }
  }
  return null;
}
