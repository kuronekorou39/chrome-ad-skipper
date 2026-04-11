import type { HlsPlaylist, HlsSegment, HlsMasterPlaylist, HlsVariant, AdMarker, AdState } from '../types/hls.js';
import { AD_TAGS } from '../constants.js';

/**
 * Parse an HLS media playlist from raw m3u8 text.
 * Lightweight parser targeting only the tags we care about for ad detection.
 */
export function parseMediaPlaylist(raw: string, url: string): HlsPlaylist {
  const lines = raw.split('\n');
  const segments: HlsSegment[] = [];
  const adMarkers: AdMarker[] = [];

  let targetDuration = 0;
  let mediaSequence = 0;
  let currentSequence = 0;
  let ended = false;
  let inAdBreak = false;
  let nextSegmentDuration = 0;
  let nextSegmentDiscontinuity = false;
  let nextSegmentProgramDateTime: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) continue;

    // Target duration
    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetDuration = parseInt(line.slice('#EXT-X-TARGETDURATION:'.length), 10);
      continue;
    }

    // Media sequence
    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      mediaSequence = parseInt(line.slice('#EXT-X-MEDIA-SEQUENCE:'.length), 10);
      currentSequence = mediaSequence;
      continue;
    }

    // Endlist
    if (line === '#EXT-X-ENDLIST') {
      ended = true;
      continue;
    }

    // Segment duration
    if (line.startsWith('#EXTINF:')) {
      const durationStr = line.slice('#EXTINF:'.length).split(',')[0];
      nextSegmentDuration = parseFloat(durationStr);
      continue;
    }

    // Discontinuity
    if (line === '#EXT-X-DISCONTINUITY') {
      nextSegmentDiscontinuity = true;
      continue;
    }

    // Program date-time
    if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')) {
      nextSegmentProgramDateTime = line.slice('#EXT-X-PROGRAM-DATE-TIME:'.length);
      continue;
    }

    // Ad markers
    if (line.startsWith(AD_TAGS.CUE_OUT + ':')) {
      const duration = parseFloat(line.slice(AD_TAGS.CUE_OUT.length + 1));
      inAdBreak = true;
      adMarkers.push({
        type: 'CUE-OUT',
        duration: isNaN(duration) ? undefined : duration,
        raw: line,
        lineIndex: i,
        segmentIndex: segments.length,
      });
      continue;
    }

    if (line === AD_TAGS.CUE_OUT || line.startsWith(AD_TAGS.CUE_OUT + '\r')) {
      inAdBreak = true;
      adMarkers.push({
        type: 'CUE-OUT',
        raw: line,
        lineIndex: i,
        segmentIndex: segments.length,
      });
      continue;
    }

    if (line.startsWith(AD_TAGS.CUE_OUT_CONT)) {
      adMarkers.push({
        type: 'CUE-OUT-CONT',
        raw: line,
        lineIndex: i,
        segmentIndex: segments.length,
      });
      continue;
    }

    if (line === AD_TAGS.CUE_IN || line.startsWith(AD_TAGS.CUE_IN + '\r')) {
      inAdBreak = false;
      adMarkers.push({
        type: 'CUE-IN',
        raw: line,
        lineIndex: i,
        segmentIndex: segments.length,
      });
      continue;
    }

    // DATERANGE (may contain ad info)
    if (line.startsWith(AD_TAGS.DATERANGE + ':')) {
      const attrs = parseDateRangeAttributes(line.slice(AD_TAGS.DATERANGE.length + 1));
      const cls = attrs['CLASS'] ?? '';

      // Only treat ad-related DATERANGE as ad markers
      // Skip Twitch metadata: timestamp, twitch-session, twitch-stream-source, twitch-trigger
      const isAdRelated = cls === 'twitch-stitched' || cls.includes('ad') || cls.includes('commercial');

      if (isAdRelated) {
        adMarkers.push({
          type: 'DATERANGE',
          raw: line,
          lineIndex: i,
          segmentIndex: segments.length,
          dateRangeAttributes: attrs,
        });

        if (cls === 'twitch-stitched') {
          inAdBreak = true;
        }
      }
      continue;
    }

    // Skip other tags
    if (line.startsWith('#')) continue;

    // This is a segment URI
    segments.push({
      uri: line,
      duration: nextSegmentDuration,
      mediaSequence: currentSequence,
      isAd: inAdBreak,
      programDateTime: nextSegmentProgramDateTime,
      discontinuity: nextSegmentDiscontinuity,
    });

    currentSequence++;
    nextSegmentDuration = 0;
    nextSegmentDiscontinuity = false;
    nextSegmentProgramDateTime = undefined;
  }

  const adState = detectAdState(adMarkers);

  return {
    url,
    targetDuration,
    mediaSequence,
    segments,
    ended,
    raw,
    fetchedAt: Date.now(),
    adState,
    adMarkers,
  };
}

/**
 * Parse an HLS master playlist to extract variant streams.
 */
export function parseMasterPlaylist(raw: string, url: string): HlsMasterPlaylist {
  const lines = raw.split('\n');
  const variants: HlsVariant[] = [];
  let pendingVariant: Partial<HlsVariant> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const attrs = line.slice('#EXT-X-STREAM-INF:'.length);
      pendingVariant = {};

      const bandwidthMatch = attrs.match(/BANDWIDTH=(\d+)/);
      if (bandwidthMatch) {
        pendingVariant.bandwidth = parseInt(bandwidthMatch[1], 10);
      }

      const resolutionMatch = attrs.match(/RESOLUTION=(\d+)x(\d+)/);
      if (resolutionMatch) {
        pendingVariant.resolution = {
          width: parseInt(resolutionMatch[1], 10),
          height: parseInt(resolutionMatch[2], 10),
        };
      }

      const codecsMatch = attrs.match(/CODECS="([^"]+)"/);
      if (codecsMatch) {
        pendingVariant.codecs = codecsMatch[1];
      }

      const nameMatch = attrs.match(/NAME="([^"]+)"/);
      if (nameMatch) {
        pendingVariant.name = nameMatch[1];
      }

      continue;
    }

    if (pendingVariant && !line.startsWith('#') && line.length > 0) {
      pendingVariant.uri = line;
      variants.push(pendingVariant as HlsVariant);
      pendingVariant = null;
    }
  }

  return {
    url,
    variants,
    raw,
    fetchedAt: Date.now(),
  };
}

/**
 * Determine if this is a master playlist (contains #EXT-X-STREAM-INF).
 */
export function isMasterPlaylist(raw: string): boolean {
  return raw.includes('#EXT-X-STREAM-INF');
}

/**
 * Parse DATERANGE attribute string into key-value pairs.
 * Example input: ID="abc",CLASS="twitch-stitched",START-DATE="2024-01-01T00:00:00Z"
 */
function parseDateRangeAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([A-Z-]+)=(?:"([^"]*)"|([^,]*))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(attrStr)) !== null) {
    attrs[match[1]] = match[2] ?? match[3];
  }

  return attrs;
}

/**
 * Detect the current ad state from ad markers in a playlist.
 */
function detectAdState(markers: AdMarker[]): AdState {
  if (markers.length === 0) return 'none';

  // Find the last meaningful marker
  for (let i = markers.length - 1; i >= 0; i--) {
    const marker = markers[i];
    if (marker.type === 'CUE-IN') return 'none';
    if (marker.type === 'CUE-OUT') return 'mid-roll';
    if (marker.type === 'CUE-OUT-CONT') return 'mid-roll';
  }

  // Has DATERANGE markers only
  const hasTwitchStitched = markers.some(
    (m) => m.type === 'DATERANGE' && m.dateRangeAttributes?.['CLASS'] === 'twitch-stitched',
  );
  if (hasTwitchStitched) return 'mid-roll';

  return 'unknown';
}
