/** A single HLS segment entry from a media playlist */
export interface HlsSegment {
  /** Segment URL (absolute or relative) */
  uri: string;
  /** Duration in seconds from #EXTINF */
  duration: number;
  /** Media sequence number */
  mediaSequence: number;
  /** Whether this segment is an ad segment (between CUE-OUT and CUE-IN) */
  isAd: boolean;
  /** Program date-time if present */
  programDateTime?: string;
  /** Discontinuity flag */
  discontinuity: boolean;
}

/** Parsed HLS media playlist */
export interface HlsPlaylist {
  /** The URL this playlist was fetched from */
  url: string;
  /** Target duration in seconds */
  targetDuration: number;
  /** Media sequence of the first segment */
  mediaSequence: number;
  /** All segments in this playlist */
  segments: HlsSegment[];
  /** Whether the playlist has an endlist tag */
  ended: boolean;
  /** Raw playlist text */
  raw: string;
  /** Timestamp when this playlist was fetched */
  fetchedAt: number;
  /** Detected ad state */
  adState: AdState;
  /** All ad markers found in this playlist */
  adMarkers: AdMarker[];
}

/** Current ad state derived from playlist analysis */
export type AdState = 'none' | 'pre-roll' | 'mid-roll' | 'unknown';

/** An ad marker found in the playlist */
export interface AdMarker {
  /** The tag type */
  type: 'CUE-OUT' | 'CUE-OUT-CONT' | 'CUE-IN' | 'DATERANGE';
  /** Duration (for CUE-OUT) */
  duration?: number;
  /** The raw tag line */
  raw: string;
  /** Line number in the playlist (0-based) */
  lineIndex: number;
  /** Associated segment index, if any */
  segmentIndex?: number;
  /** DATERANGE attributes */
  dateRangeAttributes?: Record<string, string>;
}

/** HLS variant stream from master playlist */
export interface HlsVariant {
  uri: string;
  bandwidth: number;
  resolution?: { width: number; height: number };
  codecs?: string;
  name?: string;
}

/** Parsed HLS master playlist */
export interface HlsMasterPlaylist {
  url: string;
  variants: HlsVariant[];
  raw: string;
  fetchedAt: number;
}
