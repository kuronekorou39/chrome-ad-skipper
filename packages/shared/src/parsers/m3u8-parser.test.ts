import { describe, it, expect } from 'vitest';
import { parseMediaPlaylist, parseMasterPlaylist, isMasterPlaylist } from './m3u8-parser.js';

describe('isMasterPlaylist', () => {
  it('returns true for master playlist', () => {
    const raw = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
https://example.com/720p.m3u8`;
    expect(isMasterPlaylist(raw)).toBe(true);
  });

  it('returns false for media playlist', () => {
    const raw = `#EXTM3U
#EXT-X-TARGETDURATION:2
#EXTINF:2.000,
segment0.ts`;
    expect(isMasterPlaylist(raw)).toBe(false);
  });
});

describe('parseMasterPlaylist', () => {
  it('parses variants with bandwidth and resolution', () => {
    const raw = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.4D401F,mp4a.40.2",NAME="720p"
https://example.com/720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480
https://example.com/480p.m3u8`;

    const result = parseMasterPlaylist(raw, 'https://example.com/master.m3u8');

    expect(result.variants).toHaveLength(2);
    expect(result.variants[0]).toMatchObject({
      uri: 'https://example.com/720p.m3u8',
      bandwidth: 3000000,
      resolution: { width: 1280, height: 720 },
      codecs: 'avc1.4D401F,mp4a.40.2',
      name: '720p',
    });
    expect(result.variants[1]).toMatchObject({
      uri: 'https://example.com/480p.m3u8',
      bandwidth: 1500000,
      resolution: { width: 854, height: 480 },
    });
    expect(result.url).toBe('https://example.com/master.m3u8');
  });

  it('handles variant without resolution or codecs', () => {
    const raw = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=500000
https://example.com/audio.m3u8`;

    const result = parseMasterPlaylist(raw, 'https://example.com/master.m3u8');

    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].bandwidth).toBe(500000);
    expect(result.variants[0].resolution).toBeUndefined();
  });

  it('returns empty variants for empty input', () => {
    const result = parseMasterPlaylist('#EXTM3U\n', 'https://example.com/master.m3u8');
    expect(result.variants).toHaveLength(0);
  });
});

describe('parseMediaPlaylist', () => {
  it('parses basic media playlist', () => {
    const raw = `#EXTM3U
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:100
#EXTINF:2.000,
https://cdn.example.com/seg100.ts
#EXTINF:2.000,
https://cdn.example.com/seg101.ts
#EXTINF:2.000,
https://cdn.example.com/seg102.ts`;

    const result = parseMediaPlaylist(raw, 'https://example.com/playlist.m3u8');

    expect(result.targetDuration).toBe(2);
    expect(result.mediaSequence).toBe(100);
    expect(result.segments).toHaveLength(3);
    expect(result.ended).toBe(false);
    expect(result.adState).toBe('none');
    expect(result.adMarkers).toHaveLength(0);

    expect(result.segments[0]).toMatchObject({
      uri: 'https://cdn.example.com/seg100.ts',
      duration: 2.0,
      mediaSequence: 100,
      isAd: false,
    });
    expect(result.segments[2].mediaSequence).toBe(102);
  });

  it('detects endlist', () => {
    const raw = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment0.ts
#EXT-X-ENDLIST`;

    const result = parseMediaPlaylist(raw, 'https://example.com/vod.m3u8');
    expect(result.ended).toBe(true);
  });

  it('parses discontinuity markers', () => {
    const raw = `#EXTM3U
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:2.000,
seg0.ts
#EXT-X-DISCONTINUITY
#EXTINF:2.000,
seg1.ts
#EXTINF:2.000,
seg2.ts`;

    const result = parseMediaPlaylist(raw, 'test');
    expect(result.segments[0].discontinuity).toBe(false);
    expect(result.segments[1].discontinuity).toBe(true);
    expect(result.segments[2].discontinuity).toBe(false);
  });

  it('parses program date-time', () => {
    const raw = `#EXTM3U
#EXT-X-TARGETDURATION:2
#EXT-X-PROGRAM-DATE-TIME:2024-01-15T10:00:00.000Z
#EXTINF:2.000,
seg0.ts
#EXTINF:2.000,
seg1.ts`;

    const result = parseMediaPlaylist(raw, 'test');
    expect(result.segments[0].programDateTime).toBe('2024-01-15T10:00:00.000Z');
    expect(result.segments[1].programDateTime).toBeUndefined();
  });

  it('detects CUE-OUT / CUE-IN ad markers', () => {
    const raw = `#EXTM3U
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:2.000,
content0.ts
#EXT-X-CUE-OUT:30.000
#EXTINF:2.000,
ad0.ts
#EXTINF:2.000,
ad1.ts
#EXT-X-CUE-IN
#EXTINF:2.000,
content1.ts`;

    const result = parseMediaPlaylist(raw, 'test');

    expect(result.segments).toHaveLength(4);
    expect(result.segments[0].isAd).toBe(false);
    expect(result.segments[1].isAd).toBe(true);
    expect(result.segments[2].isAd).toBe(true);
    expect(result.segments[3].isAd).toBe(false);

    expect(result.adMarkers).toHaveLength(2);
    expect(result.adMarkers[0].type).toBe('CUE-OUT');
    expect(result.adMarkers[0].duration).toBe(30);
    expect(result.adMarkers[1].type).toBe('CUE-IN');

    expect(result.adState).toBe('none'); // CUE-IN closes the ad break
  });

  it('detects active mid-roll (CUE-OUT without CUE-IN)', () => {
    const raw = `#EXTM3U
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:2.000,
content0.ts
#EXT-X-CUE-OUT:60
#EXTINF:2.000,
ad0.ts
#EXT-X-CUE-OUT-CONT:2.000/60.000
#EXTINF:2.000,
ad1.ts`;

    const result = parseMediaPlaylist(raw, 'test');

    expect(result.adState).toBe('mid-roll');
    expect(result.segments[0].isAd).toBe(false);
    expect(result.segments[1].isAd).toBe(true);
    expect(result.segments[2].isAd).toBe(true);

    expect(result.adMarkers).toHaveLength(2);
    expect(result.adMarkers[0].type).toBe('CUE-OUT');
    expect(result.adMarkers[1].type).toBe('CUE-OUT-CONT');
  });

  it('detects CUE-OUT without duration', () => {
    const raw = `#EXTM3U
#EXT-X-TARGETDURATION:2
#EXT-X-CUE-OUT
#EXTINF:2.000,
ad0.ts`;

    const result = parseMediaPlaylist(raw, 'test');
    expect(result.adMarkers[0].type).toBe('CUE-OUT');
    expect(result.adMarkers[0].duration).toBeUndefined();
    expect(result.segments[0].isAd).toBe(true);
  });

  it('detects Twitch DATERANGE ad markers', () => {
    const raw = `#EXTM3U
#EXT-X-TARGETDURATION:2
#EXT-X-DATERANGE:ID="ad-1",CLASS="twitch-stitched",START-DATE="2024-01-15T10:00:00Z"
#EXTINF:2.000,
seg0.ts`;

    const result = parseMediaPlaylist(raw, 'test');
    expect(result.adMarkers).toHaveLength(1);
    expect(result.adMarkers[0].type).toBe('DATERANGE');
    expect(result.adMarkers[0].dateRangeAttributes?.['CLASS']).toBe('twitch-stitched');
    expect(result.adState).toBe('mid-roll');
  });

  it('ignores non-ad DATERANGE tags', () => {
    const raw = `#EXTM3U
#EXT-X-TARGETDURATION:2
#EXT-X-DATERANGE:ID="ts-1",CLASS="twitch-session",START-DATE="2024-01-15T10:00:00Z"
#EXT-X-DATERANGE:ID="ts-2",CLASS="twitch-stream-source",START-DATE="2024-01-15T10:00:00Z"
#EXTINF:2.000,
seg0.ts`;

    const result = parseMediaPlaylist(raw, 'test');
    expect(result.adMarkers).toHaveLength(0);
    expect(result.adState).toBe('none');
  });

  it('handles CRLF line endings', () => {
    const raw = '#EXTM3U\r\n#EXT-X-TARGETDURATION:2\r\n#EXTINF:2.000,\r\nseg0.ts\r\n';

    const result = parseMediaPlaylist(raw, 'test');
    expect(result.segments).toHaveLength(1);
    expect(result.targetDuration).toBe(2);
  });

  it('handles empty playlist', () => {
    const raw = '#EXTM3U\n';
    const result = parseMediaPlaylist(raw, 'test');
    expect(result.segments).toHaveLength(0);
    expect(result.adMarkers).toHaveLength(0);
  });

  it('skips blank lines', () => {
    const raw = `#EXTM3U

#EXT-X-TARGETDURATION:2

#EXTINF:2.000,

seg0.ts

`;
    const result = parseMediaPlaylist(raw, 'test');
    expect(result.segments).toHaveLength(1);
  });
});
