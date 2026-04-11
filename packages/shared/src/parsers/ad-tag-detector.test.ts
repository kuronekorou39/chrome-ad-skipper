import { describe, it, expect } from 'vitest';
import { analyzeAdBreak, isLikelyAdSegmentUrl } from './ad-tag-detector.js';
import type { HlsPlaylist, AdMarker, HlsSegment } from '../types/hls.js';

function makePlaylist(segments: Partial<HlsSegment>[], adMarkers: AdMarker[] = []): HlsPlaylist {
  return {
    url: 'https://example.com/playlist.m3u8',
    targetDuration: 2,
    mediaSequence: 0,
    segments: segments.map((s, i) => ({
      uri: `seg${i}.ts`,
      duration: 2,
      mediaSequence: i,
      isAd: false,
      discontinuity: false,
      ...s,
    })),
    ended: false,
    raw: '',
    fetchedAt: Date.now(),
    adState: 'none',
    adMarkers,
  };
}

describe('analyzeAdBreak', () => {
  it('returns inactive for playlist with no ad markers', () => {
    const playlist = makePlaylist([{}, {}, {}]);
    const result = analyzeAdBreak(playlist);

    expect(result.active).toBe(false);
    expect(result.adSegmentCount).toBe(0);
  });

  it('detects active ad break from CUE-OUT without CUE-IN', () => {
    const markers: AdMarker[] = [
      { type: 'CUE-OUT', duration: 30, raw: '#EXT-X-CUE-OUT:30', lineIndex: 3, segmentIndex: 1 },
    ];
    const playlist = makePlaylist([{ isAd: false }, { isAd: true }, { isAd: true }], markers);

    const result = analyzeAdBreak(playlist);

    expect(result.active).toBe(true);
    expect(result.totalDuration).toBe(30);
    expect(result.adSegmentCount).toBe(2);
    expect(result.startMarker).toBe(markers[0]);
  });

  it('detects closed ad break (CUE-OUT + CUE-IN)', () => {
    const markers: AdMarker[] = [
      { type: 'CUE-OUT', duration: 30, raw: '#EXT-X-CUE-OUT:30', lineIndex: 3, segmentIndex: 1 },
      { type: 'CUE-IN', raw: '#EXT-X-CUE-IN', lineIndex: 8, segmentIndex: 3 },
    ];
    const playlist = makePlaylist([{ isAd: false }, { isAd: true }, { isAd: true }, { isAd: false }], markers);

    const result = analyzeAdBreak(playlist);

    expect(result.active).toBe(false);
    expect(result.adSegmentCount).toBe(2);
  });

  it('calculates remaining from CUE-OUT-CONT elapsed/duration', () => {
    const markers: AdMarker[] = [
      { type: 'CUE-OUT', duration: 60, raw: '#EXT-X-CUE-OUT:60', lineIndex: 3, segmentIndex: 1 },
      { type: 'CUE-OUT-CONT', raw: '#EXT-X-CUE-OUT-CONT:20.000/60.000', lineIndex: 6, segmentIndex: 3 },
    ];
    const playlist = makePlaylist(
      [{ isAd: false }, { isAd: true, duration: 2 }, { isAd: true, duration: 2 }, { isAd: true, duration: 2 }],
      markers,
    );

    const result = analyzeAdBreak(playlist);

    expect(result.active).toBe(true);
    expect(result.elapsed).toBe(20);
    expect(result.remaining).toBe(40);
    expect(result.totalDuration).toBe(60);
  });

  it('estimates remaining from segment durations when no CUE-OUT-CONT', () => {
    const markers: AdMarker[] = [
      { type: 'CUE-OUT', duration: 10, raw: '#EXT-X-CUE-OUT:10', lineIndex: 1, segmentIndex: 0 },
    ];
    const playlist = makePlaylist(
      [
        { isAd: true, duration: 2 },
        { isAd: true, duration: 2 },
        { isAd: true, duration: 2 },
      ],
      markers,
    );

    const result = analyzeAdBreak(playlist);

    expect(result.active).toBe(true);
    expect(result.remaining).toBe(4); // 10 - (2+2+2) = 4
    expect(result.elapsed).toBeUndefined();
  });

  it('clamps remaining to zero', () => {
    const markers: AdMarker[] = [
      { type: 'CUE-OUT', duration: 4, raw: '#EXT-X-CUE-OUT:4', lineIndex: 1, segmentIndex: 0 },
    ];
    const playlist = makePlaylist(
      [
        { isAd: true, duration: 2 },
        { isAd: true, duration: 2 },
        { isAd: true, duration: 2 },
      ],
      markers,
    );

    const result = analyzeAdBreak(playlist);
    expect(result.remaining).toBe(0);
  });

  it('detects Twitch DATERANGE-based ad', () => {
    const markers: AdMarker[] = [
      {
        type: 'DATERANGE',
        raw: '#EXT-X-DATERANGE:ID="ad-1",CLASS="twitch-stitched"',
        lineIndex: 2,
        segmentIndex: 0,
        dateRangeAttributes: { ID: 'ad-1', CLASS: 'twitch-stitched' },
      },
    ];
    const playlist = makePlaylist([{ isAd: true }], markers);

    const result = analyzeAdBreak(playlist);
    expect(result.active).toBe(true);
  });

  it('handles multiple ad breaks — last one wins', () => {
    const markers: AdMarker[] = [
      { type: 'CUE-OUT', duration: 15, raw: '#EXT-X-CUE-OUT:15', lineIndex: 1, segmentIndex: 0 },
      { type: 'CUE-IN', raw: '#EXT-X-CUE-IN', lineIndex: 5, segmentIndex: 2 },
      { type: 'CUE-OUT', duration: 30, raw: '#EXT-X-CUE-OUT:30', lineIndex: 8, segmentIndex: 3 },
    ];
    const playlist = makePlaylist([{ isAd: true }, { isAd: true }, { isAd: false }, { isAd: true }], markers);

    const result = analyzeAdBreak(playlist);
    expect(result.active).toBe(true);
    expect(result.totalDuration).toBe(30);
  });
});

describe('isLikelyAdSegmentUrl', () => {
  it('detects /ad/ in URL', () => {
    expect(isLikelyAdSegmentUrl('https://cdn.example.com/ad/segment123.ts')).toBe(true);
  });

  it('detects _ad_ in URL', () => {
    expect(isLikelyAdSegmentUrl('https://cdn.example.com/stream_ad_001.ts')).toBe(true);
  });

  it('detects adsegment in URL', () => {
    expect(isLikelyAdSegmentUrl('https://cdn.example.com/adsegment.ts')).toBe(true);
  });

  it('returns false for normal content URL', () => {
    expect(isLikelyAdSegmentUrl('https://cdn.example.com/v1/stream/seg123.ts')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(isLikelyAdSegmentUrl('https://cdn.example.com/AD/SEGMENT.ts')).toBe(true);
  });
});
